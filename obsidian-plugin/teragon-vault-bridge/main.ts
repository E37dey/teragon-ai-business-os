// TERAGON Vault Bridge — Obsidian plugin. Thin wrapper: on load it starts the shared
// loopback bridge (bridgeServer.mjs) with an app.vault-backed provider; on unload it
// closes the server and releases the port. READS are GET-only. WRITES (Phase 3) go
// through applyWrite via OFFICIAL Vault APIs only (create / process) — never raw fs —
// and are human-approved, hash-guarded (conflict) and idempotent at the bridge layer.
// This file is built by esbuild INSIDE Obsidian; it is intentionally OUTSIDE the
// TERAGON src/ tree and is NOT compiled by the app.
import { App, Modal, Notice, Plugin, TFile } from "obsidian";
// eslint-disable-next-line import/extensions
import { createBridge, generateToken, BRIDGE_VERSION, sha256 } from "./bridgeServer.mjs";

const DEFAULT_PORT = 5200;
const WRITE_CONFIRM_TIMEOUT_MS = 120000; // human has this long to decide before EXPIRED

type WriteDecision = "approved" | "rejected" | "expired";
interface WriteIntent {
  op: string;
  path: string;
  expectedHash: string;
  proposedHash: string;
  preview: string;
}

/**
 * LOCAL HUMAN CONFIRMATION inside the Obsidian trust boundary. TERAGON can stage a
 * write intent, but app.vault is touched ONLY after the human clicks Approve HERE.
 * No client-held secret can substitute for this in-Obsidian decision.
 */
class WriteConfirmModal extends Modal {
  private decided = false;
  private readonly intent: WriteIntent;
  private readonly done: (d: WriteDecision) => void;
  constructor(app: App, intent: WriteIntent, done: (d: WriteDecision) => void) {
    super(app);
    this.intent = intent;
    this.done = done;
  }
  onOpen(): void {
    this.titleEl.setText("TERAGON — אישור כתיבה לכספת");
    const c = this.contentEl;
    c.createEl("p", { text: "TERAGON מבקש לכתוב לכספת המקומית. אשרו רק אם אתם יזמתם פעולה זו כעת." });
    const info = c.createEl("div");
    info.createEl("div", { text: `פעולה: ${this.intent.op}` });
    info.createEl("div", { text: `נתיב: ${this.intent.path}` });
    info.createEl("div", { text: `hash נוכחי (צפוי): ${String(this.intent.expectedHash).slice(0, 16)}` });
    info.createEl("div", { text: `hash מוצע: ${String(this.intent.proposedHash).slice(0, 16)}` });
    const pre = c.createEl("pre");
    pre.setText(this.intent.preview.slice(0, 600));
    const btns = c.createEl("div");
    const approve = btns.createEl("button", { text: "אשר כתיבה" });
    approve.addEventListener("click", () => this.decide("approved"));
    const reject = btns.createEl("button", { text: "דחה" });
    reject.addEventListener("click", () => this.decide("rejected"));
  }
  private decide(d: WriteDecision): void {
    if (this.decided) return;
    this.decided = true;
    this.done(d);
    this.close();
  }
  onClose(): void {
    if (!this.decided) {
      this.decided = true;
      this.done("rejected"); // dismissing the dialog is a rejection, never an approval
    }
    this.contentEl.empty();
  }
}
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
  private writeKey = "";

  async onload(): Promise<void> {
    // Dev-only: a fresh strong random pairing token per load; revealed once via a command.
    this.token = generateToken();
    // SEPARATE write-authorization secret (NOT the pairing token). Revealed via its own
    // command; required (as an HMAC capability) for any Vault mutation.
    this.writeKey = generateToken();
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
      // STAGE a write (Phase 3). Shows a LOCAL human confirmation in Obsidian and touches
      // app.vault ONLY on human approval — via OFFICIAL Vault APIs, conflict-guarded, never
      // .obsidian/absolute/../ /non-md (path pre-validated). No client secret can bypass this.
      stageWrite: async (input: {
        op: "create" | "update" | "append";
        rel: string;
        content?: string;
        block?: string;
        expectedHash?: string;
      }): Promise<{ ok: boolean; code?: string; path?: string; hash?: string; currentHash?: string }> => {
        const rel = input.rel;
        const preview = input.op === "append" ? (input.block ?? "") : (input.content ?? "");
        const decision = await this.confirmWriteInObsidian({
          op: input.op,
          path: rel,
          expectedHash: input.expectedHash ?? "(new file)",
          proposedHash: sha256(preview),
          preview,
        });
        if (decision === "rejected") return { ok: false, code: "REJECTED" };
        if (decision === "expired") return { ok: false, code: "EXPIRED" };
        // HUMAN-APPROVED inside Obsidian → apply.
        if (input.op === "create") {
          if (this.app.vault.getAbstractFileByPath(rel)) return { ok: false, code: "EXISTS" };
          const created = await this.app.vault.create(rel, input.content ?? "");
          return { ok: true, path: created.path, hash: sha256(input.content ?? "") };
        }
        const file = this.app.vault.getAbstractFileByPath(rel);
        if (!(file instanceof TFile)) return { ok: false, code: "NOT_FOUND" };
        if (file.extension !== "md" && file.extension !== "markdown") return { ok: false, code: "NOT_FOUND" };
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
    this.bridge = createBridge({ token: this.token, writeKey: this.writeKey, allowedOrigins: ALLOWED_ORIGINS, vault });
    await (this.bridge as unknown as { start: (p: number) => Promise<unknown> }).start(DEFAULT_PORT);

    this.addCommand({
      id: "show-pairing-token",
      name: "Copy TERAGON pairing token (once)",
      callback: () => {
        void navigator.clipboard?.writeText(this.token);
        new Notice("TERAGON pairing token copied. Paste it into TERAGON. Do not share or commit it.");
      },
    });
    this.addCommand({
      id: "show-write-key",
      name: "Copy TERAGON write key (once)",
      callback: () => {
        void navigator.clipboard?.writeText(this.writeKey);
        new Notice("TERAGON write key copied. Required to AUTHORIZE approved writes — the pairing token alone cannot write. Do not share or commit it.");
      },
    });
    // token is NEVER logged
    console.info(`[teragon-vault-bridge] ${BRIDGE_VERSION} listening on 127.0.0.1:${DEFAULT_PORT} (read + approved-write)`);
  }

  /** Show the in-Obsidian confirmation and resolve the human's decision (or timeout). */
  private confirmWriteInObsidian(intent: WriteIntent): Promise<WriteDecision> {
    return new Promise<WriteDecision>((resolve) => {
      let settled = false;
      const finish = (d: WriteDecision): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(d);
      };
      const modal = new WriteConfirmModal(this.app, intent, finish);
      const timer = setTimeout(() => {
        finish("expired");
        modal.close();
      }, WRITE_CONFIRM_TIMEOUT_MS);
      modal.open();
    });
  }

  async onunload(): Promise<void> {
    await this.bridge?.close();
    this.bridge = null;
    this.token = "";
    this.writeKey = "";
  }
}
