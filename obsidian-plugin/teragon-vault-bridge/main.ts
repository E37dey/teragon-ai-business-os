// TERAGON Vault Bridge — Phase 0 Obsidian plugin (development-only, READ-ONLY).
// Thin wrapper: on load it starts the shared loopback bridge (bridgeServer.mjs)
// with an app.vault-backed read-only provider; on unload it closes the server and
// releases the port. NOTE: this file is built by the Obsidian plugin toolchain
// (esbuild) INSIDE Obsidian; it is intentionally OUTSIDE the TERAGON src/ tree and
// is NOT compiled by the app. It has not been runtime-verified without an Obsidian
// Desktop install (see OBSIDIAN_PHASE0_TRANSPORT_SPIKE.md); the transport + security
// it relies on ARE verified via the shared bridgeServer.mjs tests + the live spike.
import { Plugin, Notice, TFile } from "obsidian";
// eslint-disable-next-line import/extensions
import { createBridge, generateToken, BRIDGE_VERSION } from "./bridgeServer.mjs";

const DEFAULT_PORT = 5200;
// The TERAGON dev origin(s) allowed to call the bridge (explicit allowlist; no wildcard).
const ALLOWED_ORIGINS = ["http://localhost:4173", "http://127.0.0.1:4173"];
const SEARCH_SCAN_CAP = 1000; // max notes scanned per search (bounded work)
const SEARCH_RESULT_CAP = 50; // max results returned per search
const SNIPPET_LEN = 160;

function makeSnippet(text: string, at: number): string {
  const start = Math.max(0, at - 40);
  return text
    .slice(start, start + SNIPPET_LEN)
    .replace(/\s+/g, " ")
    .trim();
}

export default class TeragonVaultBridge extends Plugin {
  private bridge: { close: () => Promise<void> } | null = null;
  private token = "";

  async onload(): Promise<void> {
    // Dev-only: a fresh strong random pairing token per load; revealed once via a command.
    this.token = generateToken();
    const vault = {
      getName: () => this.app.vault.getName(),
      listNotes: () =>
        this.app.vault.getMarkdownFiles().map((f) => ({
          path: f.path,
          basename: f.basename,
          mtime: f.stat?.mtime,
        })),
      // Read-only single note via Obsidian Vault APIs (never raw fs). Returns null
      // when the path is not a Markdown TFile in this vault.
      readNote: async (rel: string) => {
        const file = this.app.vault.getAbstractFileByPath(rel);
        if (!(file instanceof TFile)) return null;
        if (file.extension !== "md" && file.extension !== "markdown") return null;
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
        const content = await this.app.vault.cachedRead(file);
        return { path: file.path, basename: file.basename, frontmatter, mtime: file.stat?.mtime ?? null, content };
      },
      // Local bounded search over filename, path, and Markdown text. Read-only.
      searchNotes: async (query: string) => {
        const q = query.toLowerCase();
        const files = this.app.vault.getMarkdownFiles().slice(0, SEARCH_SCAN_CAP);
        const out: Array<{ path: string; basename: string; snippet: string; mtime: number | null }> = [];
        for (const f of files) {
          if (out.length >= SEARCH_RESULT_CAP) break;
          const nameHit = f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q);
          const content = await this.app.vault.cachedRead(f);
          const idx = content.toLowerCase().indexOf(q);
          if (!nameHit && idx < 0) continue;
          const snippet = idx >= 0 ? makeSnippet(content, idx) : content.slice(0, SNIPPET_LEN).replace(/\s+/g, " ").trim();
          out.push({ path: f.path, basename: f.basename, snippet, mtime: f.stat?.mtime ?? null });
        }
        return out;
      },
    };
    this.bridge = createBridge({ token: this.token, allowedOrigins: ALLOWED_ORIGINS, vault });
    await (this.bridge as unknown as { start: (p: number) => Promise<unknown> }).start(DEFAULT_PORT);

    this.addCommand({
      id: "show-pairing-token",
      name: "Copy TERAGON pairing token (once)",
      callback: () => {
        void navigator.clipboard?.writeText(this.token);
        new Notice("TERAGON pairing token copied. Paste it into TERAGON. Do not share or commit it.");
      },
    });
    // token is NEVER logged
    console.info(`[teragon-vault-bridge] ${BRIDGE_VERSION} listening on 127.0.0.1:${DEFAULT_PORT} (read-only)`);
  }

  async onunload(): Promise<void> {
    await this.bridge?.close();
    this.bridge = null;
    this.token = "";
  }
}
