// S14.4 Phase 3 — write-proposal governance service against a live bridge.
// Proves: propose = no mutation, reject = no mutation, approve→execute = exactly one
// mutation + read-back verification, conflict blocks overwrite, idempotent replay.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBridge, sha256 } from "../../obsidian-plugin/teragon-vault-bridge/bridgeServer.mjs";
import {
  approveWriteProposal,
  createWriteProposal,
  executeWriteProposal,
  rejectWriteProposal,
  type WriteProposal,
} from "@/integration/obsidian/obsidianWrite";

function writableVault(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    getName: () => "WriteVault",
    listNotes: () => [...files.keys()].map((p) => ({ path: p, basename: p, mtime: 1 })),
    readNote: (rel: string) => (files.has(rel) ? { path: rel, basename: rel, frontmatter: null, mtime: 1, content: files.get(rel) } : null),
    applyWrite: (input: { op: string; rel: string; content?: string; block?: string; expectedHash?: string }) => {
      const rel = input.rel;
      if (input.op === "create") {
        if (files.has(rel)) return { ok: false, code: "EXISTS" };
        files.set(rel, input.content ?? "");
        return { ok: true, path: rel, hash: sha256(input.content ?? "") };
      }
      if (!files.has(rel)) return { ok: false, code: "NOT_FOUND" };
      const current = files.get(rel)!;
      if (sha256(current) !== input.expectedHash) return { ok: false, code: "CONFLICT", currentHash: sha256(current) };
      let next: string;
      if (input.op === "update") next = input.content ?? "";
      else {
        const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
        next = current + sep + (input.block ?? "") + ((input.block ?? "").endsWith("\n") ? "" : "\n");
      }
      files.set(rel, next);
      return { ok: true, path: rel, hash: sha256(next) };
    },
    _files: files,
  };
}

const WHO = { id: "u-tzachi", name: "צחי זוסטייהם" };
let bridge: { close: () => Promise<void>; start: (p: number) => Promise<{ port: number }> };
let base: string;
let vault: ReturnType<typeof writableVault>;

beforeEach(async () => {
  vault = writableVault({ "Existing.md": "# Existing\n\nline1\n" });
  bridge = createBridge({ token: "t", allowedOrigins: [], vault });
  base = `http://127.0.0.1:${(await bridge.start(0)).port}`;
});
afterEach(async () => {
  await bridge.close();
});

const exec = (p: WriteProposal) => executeWriteProposal(p, { token: "t", baseUrl: base });

describe("write proposal — no mutation before approval", () => {
  it("proposing performs NO bridge write", async () => {
    const before = vault._files.size;
    const p = await createWriteProposal({ operation: "create", vaultName: "WriteVault", path: "New.md", proposedContent: "# New\n" });
    expect(p.state).toBe("PROPOSED");
    expect(p.mutationId).toBeTruthy();
    expect(p.correlationId).toBeTruthy();
    expect(vault._files.size).toBe(before); // nothing written
  });

  it("reject performs NO bridge write and blocks execution", async () => {
    const p = await createWriteProposal({ operation: "create", vaultName: "WriteVault", path: "R.md", proposedContent: "x\n" });
    const rejected = rejectWriteProposal(p);
    expect(rejected.state).toBe("REJECTED");
    const afterExec = await exec(rejected); // not APPROVED → no-op
    expect(afterExec.state).toBe("REJECTED");
    expect(vault._files.has("R.md")).toBe(false);
  });
});

describe("create / update / append — exactly one mutation + verification", () => {
  it("CREATE: approve→execute creates the file once and verifies read-back", async () => {
    const p = await createWriteProposal({ operation: "create", vaultName: "WriteVault", path: "Created.md", proposedContent: "# Created\n\nhello\n" });
    const done = await exec(approveWriteProposal(p, WHO));
    expect(done.state).toBe("WRITTEN");
    expect(done.approvedByName).toBe("צחי זוסטייהם");
    expect(done.resultHash).toBe(sha256("# Created\n\nhello\n"));
    expect(vault._files.get("Created.md")).toBe("# Created\n\nhello\n");
  });

  it("UPDATE: overwrites exactly once when base matches", async () => {
    const current = vault._files.get("Existing.md")!;
    const p = await createWriteProposal({ operation: "update", vaultName: "WriteVault", path: "Existing.md", baseContent: current, proposedContent: "# Existing\n\nUPDATED\n" });
    const done = await exec(approveWriteProposal(p, WHO));
    expect(done.state).toBe("WRITTEN");
    expect(vault._files.get("Existing.md")).toBe("# Existing\n\nUPDATED\n");
  });

  it("APPEND: appends the block once; replay of the SAME proposal does not append twice", async () => {
    const current = vault._files.get("Existing.md")!;
    const approved = approveWriteProposal(
      await createWriteProposal({ operation: "append", vaultName: "WriteVault", path: "Existing.md", baseContent: current, appendBlock: "APPENDED-BLOCK" }),
      WHO,
    );
    const first = await exec(approved);
    expect(first.state).toBe("WRITTEN");
    const afterFirst = vault._files.get("Existing.md")!;
    expect((afterFirst.match(/APPENDED-BLOCK/g) || []).length).toBe(1);
    // replay the same approved proposal (same mutationId) → plugin idempotency
    const second = await exec(approved);
    expect(second.state).toBe("WRITTEN");
    expect((vault._files.get("Existing.md")!.match(/APPENDED-BLOCK/g) || []).length).toBe(1);
  });
});

describe("conflict — refuse to overwrite an externally changed note", () => {
  it("CONFLICT when the note changed after preview; original change preserved", async () => {
    const current = vault._files.get("Existing.md")!;
    const approved = approveWriteProposal(
      await createWriteProposal({ operation: "update", vaultName: "WriteVault", path: "Existing.md", baseContent: current, proposedContent: "TERAGON-CLOBBER\n" }),
      WHO,
    );
    // external change AFTER the preview captured baseHash
    vault._files.set("Existing.md", "EXTERNAL EDIT WINS\n");
    const done = await exec(approved);
    expect(done.state).toBe("CONFLICT");
    expect(done.failureCode).toBe("CONFLICT");
    expect(vault._files.get("Existing.md")).toBe("EXTERNAL EDIT WINS\n"); // not overwritten
  });
});

describe("execution guard — an already-written proposal cannot execute again", () => {
  it("re-executing a WRITTEN proposal is a no-op", async () => {
    const p = await createWriteProposal({ operation: "create", vaultName: "WriteVault", path: "Once.md", proposedContent: "one\n" });
    const done = await exec(approveWriteProposal(p, WHO));
    expect(done.state).toBe("WRITTEN");
    const again = await exec(done); // state is WRITTEN, not APPROVED
    expect(again.state).toBe("WRITTEN");
    expect(vault._files.get("Once.md")).toBe("one\n");
  });
});
