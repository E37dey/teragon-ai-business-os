// TERAGON Vault Bridge — Obsidian plugin. Thin wrapper: on load it starts the shared
// loopback bridge (bridgeServer.mjs) with an app.vault-backed provider; on unload it
// closes the server and releases the port. READS are GET-only. WRITES (Phase 3) go
// through applyWrite via OFFICIAL Vault APIs only (create / process) — never raw fs —
// and are human-approved, hash-guarded (conflict) and idempotent at the bridge layer.
// This file is built by esbuild INSIDE Obsidian; it is intentionally OUTSIDE the
// TERAGON src/ tree and is NOT compiled by the app.
import { Plugin, Notice, TFile } from "obsidian";
// eslint-disable-next-line import/extensions
import { createBridge, generateToken, BRIDGE_VERSION, sha256 } from "./bridgeServer.mjs";

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
      // Human-approved WRITE (Phase 3) via OFFICIAL Vault APIs only. create/update/append.
      // Conflict guard: re-reads the CURRENT note and compares to the previewed hash before
      // overwriting. Never touches .obsidian/absolute/../ /non-md (path pre-validated).
      applyWrite: async (input: {
        op: "create" | "update" | "append";
        rel: string;
        content?: string;
        block?: string;
        expectedHash?: string;
      }): Promise<{ ok: boolean; code?: string; path?: string; hash?: string; currentHash?: string }> => {
        const rel = input.rel;
        if (input.op === "create") {
          if (this.app.vault.getAbstractFileByPath(rel)) return { ok: false, code: "EXISTS" };
          const created = await this.app.vault.create(rel, input.content ?? "");
          return { ok: true, path: created.path, hash: sha256(input.content ?? "") };
        }
        const file = this.app.vault.getAbstractFileByPath(rel);
        if (!(file instanceof TFile)) return { ok: false, code: "NOT_FOUND" };
        if (file.extension !== "md" && file.extension !== "markdown") return { ok: false, code: "NOT_FOUND" };
        // Re-read the real current note; refuse to overwrite if it changed since preview.
        const current = await this.app.vault.read(file);
        const currentHash = sha256(current);
        if (currentHash !== input.expectedHash) return { ok: false, code: "CONFLICT", currentHash };
        let next: string;
        if (input.op === "update") {
          next = input.content ?? "";
        } else {
          const block = input.block ?? "";
          const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
          next = current + sep + block + (block.endsWith("\n") ? "" : "\n");
        }
        await this.app.vault.process(file, () => next);
        return { ok: true, path: file.path, hash: sha256(next) };
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
    console.info(`[teragon-vault-bridge] ${BRIDGE_VERSION} listening on 127.0.0.1:${DEFAULT_PORT} (read + approved-write)`);
  }

  async onunload(): Promise<void> {
    await this.bridge?.close();
    this.bridge = null;
    this.token = "";
  }
}
