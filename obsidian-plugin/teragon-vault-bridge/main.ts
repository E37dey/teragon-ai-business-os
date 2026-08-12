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
// A trusted TERAGON device: PUBLIC identity only (never a private key or bearer). Persisted
// in THIS vault's plugin data (data.json) → naturally scoped to this vault.
interface TrustedDevice {
  deviceId: string;
  publicKey: { kty: string; crv: string; x: string; y: string };
  fingerprint: string;
  label: string;
  origin: string;
  vaultName: string;
  createdAt: number;
  lastSeenAt: number;
  revoked: boolean;
}

/** Manage trusted TERAGON browsers — shows NON-secret metadata only; supports revocation. */
class TrustedDevicesModal extends Modal {
  private readonly devices: Map<string, TrustedDevice>;
  private readonly onRevoke: (deviceId: string) => void;
  private readonly onRevokeAll: () => void;
  constructor(app: App, devices: Map<string, TrustedDevice>, onRevoke: (id: string) => void, onRevokeAll: () => void) {
    super(app);
    this.devices = devices;
    this.onRevoke = onRevoke;
    this.onRevokeAll = onRevokeAll;
  }
  onOpen(): void {
    this.render();
  }
  private render(): void {
    this.titleEl.setText("TERAGON — מכשירים מהימנים");
    const c = this.contentEl;
    c.empty();
    const active = [...this.devices.values()].filter((d) => !d.revoked);
    if (active.length === 0) {
      c.createEl("p", { text: "אין מכשירים מהימנים. חברו דפדפן דרך קוד ההתאמה החד-פעמי." });
      return;
    }
    c.createEl("p", { text: "דפדפנים שאושרו להתחבר מחדש אוטומטית לאחר הפעלה מחדש (מידע ציבורי בלבד):" });
    for (const d of active) {
      const row = c.createEl("div");
      row.createEl("div", { text: `${d.label} · ${d.fingerprint.slice(-12)}` });
      row.createEl("div", { text: `נוצר: ${new Date(d.createdAt).toLocaleString()} · נראה לאחרונה: ${new Date(d.lastSeenAt).toLocaleString()}` });
      row.createEl("div", { text: `מקור: ${d.origin} · כספת: ${d.vaultName}` });
      const revoke = row.createEl("button", { text: "בטל אמון" });
      revoke.addEventListener("click", () => {
        this.onRevoke(d.deviceId);
        this.render();
        new Notice("המכשיר נשלל. יידרש חיבור מחדש עם קוד התאמה.");
      });
    }
    const all = c.createEl("button", { text: "בטל אמון לכל המכשירים" });
    all.addEventListener("click", () => {
      this.onRevokeAll();
      this.render();
      new Notice("כל המכשירים נשללו.");
    });
  }
  onClose(): void {
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
  // Persistent trusted-device registry (PUBLIC keys only) — loaded from this vault's
  // data.json, so trust is inherently scoped to this vault.
  private trustedDevices = new Map<string, TrustedDevice>();

  private async loadTrust(): Promise<void> {
    try {
      const data = (await this.loadData()) as { trustedDevices?: TrustedDevice[] } | null;
      const arr = Array.isArray(data?.trustedDevices) ? data!.trustedDevices : [];
      for (const d of arr) {
        if (d && typeof d.deviceId === "string" && d.publicKey && typeof d.publicKey.x === "string") this.trustedDevices.set(d.deviceId, d);
      }
    } catch {
      /* fresh registry on any read fault */
    }
  }
  private async persistTrust(): Promise<void> {
    try {
      await this.saveData({ trustedDevices: [...this.trustedDevices.values()] });
    } catch {
      /* best-effort persistence; in-memory registry still authoritative this session */
    }
  }

  async onload(): Promise<void> {
    await this.loadTrust();
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
      // Bounded knowledge GRAPH from OFFICIAL metadata: getMarkdownFiles() + resolvedLinks.
      // Nodes carry bounded metadata only (never bodies); edges are real Markdown-to-Markdown
      // links. Highest-degree nodes are kept when the vault exceeds the node bound.
      getGraph: (maxNodes: number, maxEdges: number) => {
        const files = this.app.vault.getMarkdownFiles();
        const mdPaths = new Set(files.map((f) => f.path));
        const resolved = this.app.metadataCache.resolvedLinks ?? {};
        const degree = new Map<string, number>();
        const rawEdges: Array<{ source: string; target: string; count: number }> = [];
        for (const src of Object.keys(resolved)) {
          if (!mdPaths.has(src)) continue; // Markdown notes only
          const targets = resolved[src] ?? {};
          for (const tgt of Object.keys(targets)) {
            if (tgt === src || !mdPaths.has(tgt)) continue; // only real note→note links
            const count = targets[tgt] ?? 1;
            rawEdges.push({ source: src, target: tgt, count });
            degree.set(src, (degree.get(src) ?? 0) + count);
            degree.set(tgt, (degree.get(tgt) ?? 0) + count);
          }
        }
        let selected = files;
        let truncated = false;
        if (files.length > maxNodes) {
          selected = [...files].sort((a, b) => (degree.get(b.path) ?? 0) - (degree.get(a.path) ?? 0)).slice(0, maxNodes);
          truncated = true;
        }
        const selSet = new Set(selected.map((f) => f.path));
        const nodes = selected.map((f) => {
          const cache = this.app.metadataCache.getFileCache(f);
          const inlineTags = (cache?.tags ?? []).map((t) => t.tag);
          const fmTagsRaw = cache?.frontmatter?.tags;
          const fmTags = Array.isArray(fmTagsRaw) ? fmTagsRaw.map((t) => `#${String(t).replace(/^#/, "")}`) : [];
          const tags = Array.from(new Set([...inlineTags, ...fmTags])).slice(0, 12);
          return { id: f.path, path: f.path, basename: f.basename, mtime: f.stat?.mtime ?? null, tags, linkCount: degree.get(f.path) ?? 0 };
        });
        const edges = rawEdges.filter((e) => selSet.has(e.source) && selSet.has(e.target));
        return { nodes, edges: edges.slice(0, maxEdges), truncated: truncated || edges.length > maxEdges };
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
    // Trusted-device registry: the bridge reads/records PUBLIC device info only; the plugin
    // persists it to this vault's data.json (naturally vault-scoped). Each stored record is
    // tagged with the current vaultName for audit/display.
    const trustStore = {
      list: () => [...this.trustedDevices.values()],
      get: (deviceId: string) => this.trustedDevices.get(deviceId) ?? null,
      put: (rec: TrustedDevice) => {
        this.trustedDevices.set(rec.deviceId, { ...rec, vaultName: this.app.vault.getName() });
        void this.persistTrust();
      },
      touch: (deviceId: string, at: number) => {
        const d = this.trustedDevices.get(deviceId);
        if (d) {
          d.lastSeenAt = at;
          void this.persistTrust();
        }
      },
    };
    this.bridge = createBridge({ token: this.token, writeKey: this.writeKey, allowedOrigins: ALLOWED_ORIGINS, vault, trustStore });
    await (this.bridge as unknown as { start: (p: number) => Promise<unknown> }).start(DEFAULT_PORT);

    this.addCommand({
      id: "manage-trusted-devices",
      name: "Manage TERAGON trusted devices",
      callback: () => {
        new TrustedDevicesModal(
          this.app,
          this.trustedDevices,
          (id) => {
            const d = this.trustedDevices.get(id);
            if (d) {
              d.revoked = true;
              void this.persistTrust();
            }
          },
          () => {
            for (const d of this.trustedDevices.values()) d.revoked = true;
            void this.persistTrust();
          },
        ).open();
      },
    });

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
