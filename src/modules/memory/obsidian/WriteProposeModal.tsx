// S14.4 Phase 3 — human-approved write-back UI. compose → preview/diff → explicit
// approval → one write → verification. NOT synchronization. Reject/close writes nothing.
import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Modal, OsButton, StatusChip, useToast } from "@/design-system";
import type { NoteContent } from "@/integration/obsidian/vaultBridgeClient";
import {
  approveWriteProposal,
  createWriteProposal,
  executeWriteProposal,
  isSafeMarkdownPath,
  rejectWriteProposal,
  type WriteOperation,
  type WriteProposal,
} from "@/integration/obsidian/obsidianWrite";
import { hasObsidianWriteKey, setObsidianWriteKey } from "@/integration/obsidian/obsidianCredential";

const stack = (gap = "var(--os-space-3)"): CSSProperties => ({ display: "grid", gap });
const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "var(--os-space-2)", alignItems: "center" };
const metaRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "var(--os-space-2)", fontSize: "var(--os-text-2xs, 11px)" };
const muted: CSSProperties = { color: "var(--os-text-2)" };
const codeStyle: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate" };
const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: "var(--os-text-sm, 13px)",
  background: "var(--os-bg-2, transparent)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: 8,
  paddingInline: 10,
  width: "100%",
};
const preStyle: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: "32vh",
  overflow: "auto",
  background: "var(--os-bg-2, transparent)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  padding: "var(--os-space-3)",
  fontSize: "var(--os-text-sm, 13px)",
};

const OP_LABEL: Record<WriteOperation, string> = { create: "צור חדש", update: "עדכן", append: "הוסף בסוף" };

/** Minimal LCS line diff for the preview. */
function computeLineDiff(before: string, after: string): Array<{ t: "same" | "add" | "del"; line: string }> {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: Array<{ t: "same" | "add" | "del"; line: string }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ t: "same", line: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ t: "del", line: a[i]! });
      i++;
    } else {
      out.push({ t: "add", line: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ t: "del", line: a[i++]! });
  while (j < m) out.push({ t: "add", line: b[j++]! });
  return out;
}

function DiffView({ before, after }: { before: string; after: string }): ReactElement {
  const diff = useMemo(() => computeLineDiff(before, after), [before, after]);
  return (
    <pre data-testid="obsidian-write-diff" style={{ ...preStyle, ...codeStyle }}>
      {diff.map((d, idx) => (
        <div
          key={idx}
          style={{
            background: d.t === "add" ? "rgba(46,160,67,0.18)" : d.t === "del" ? "rgba(192,57,43,0.18)" : "transparent",
            color: d.t === "same" ? "var(--os-text-2)" : "var(--os-text)",
          }}
        >
          {d.t === "add" ? "+ " : d.t === "del" ? "- " : "  "}
          {d.line}
        </div>
      ))}
    </pre>
  );
}

type Step = "compose" | "preview" | "result";

export function WriteProposeModal({
  vaultName,
  onLoadCurrent,
  onClose,
}: {
  vaultName: string;
  onLoadCurrent: (path: string) => Promise<NoteContent | null>;
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("compose");
  const [op, setOp] = useState<WriteOperation>("create");
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [baseContent, setBaseContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<WriteProposal | null>(null);
  const [result, setResult] = useState<WriteProposal | null>(null);
  const [writePaired, setWritePaired] = useState<boolean>(() => hasObsidianWriteKey());
  const [writeKeyInput, setWriteKeyInput] = useState("");

  const pairWriteKey = useCallback(() => {
    const k = writeKeyInput.trim();
    if (!k) return;
    setObsidianWriteKey(k);
    setWritePaired(true);
    setWriteKeyInput("");
    toast("הרשאת כתיבה אומתה", "success");
  }, [writeKeyInput, toast]);

  const needsBase = op !== "create";
  const pathSafe = isSafeMarkdownPath(path.trim());

  const resetCompose = useCallback(() => {
    setStep("compose");
    setProposal(null);
    setResult(null);
    setBaseContent(null);
    setContent("");
  }, []);

  const loadCurrent = useCallback(async () => {
    if (!pathSafe) return;
    setLoading(true);
    const note = await onLoadCurrent(path.trim());
    setLoading(false);
    if (!note) {
      toast("הקובץ לא נמצא בכספת", "danger");
      setBaseContent(null);
      return;
    }
    setBaseContent(note.content);
    if (op === "update") setContent(note.content);
    toast("התוכן הנוכחי נטען", "info");
  }, [pathSafe, path, onLoadCurrent, op, toast]);

  const propose = useCallback(async () => {
    const p = await createWriteProposal({
      operation: op,
      vaultName,
      path: path.trim(),
      ...(op === "append" ? { appendBlock: content } : { proposedContent: content }),
      ...(needsBase ? { baseContent } : {}),
    });
    setProposal(p);
    setStep("preview");
  }, [op, vaultName, path, content, needsBase, baseContent]);

  const approveAndWrite = useCallback(async () => {
    if (!proposal) return;
    setBusy(true);
    const done = await executeWriteProposal(approveWriteProposal(proposal));
    setBusy(false);
    setResult(done);
    setStep("result");
    if (done.state === "WRITTEN") toast("נכתב ל-Obsidian", "success");
    else if (done.state === "CONFLICT") toast("התגלה שינוי בקובץ — הכתיבה נמנעה", "warning");
    else toast("הכתיבה נכשלה", "danger");
  }, [proposal, toast]);

  const reject = useCallback(() => {
    if (proposal) setResult(rejectWriteProposal(proposal));
    setStep("result");
    toast("הכתיבה נדחתה", "info");
  }, [proposal, toast]);

  const composeInvalid =
    !pathSafe || content.trim().length === 0 || (needsBase && baseContent === null);

  return (
    <Modal open onClose={onClose} title="כתיבה ל-Obsidian (באישור אנושי)">
      <div style={stack()} data-testid="obsidian-write-modal">
        {step === "compose" && (
          <div style={stack()}>
            <div style={row}>
              {(["create", "update", "append"] as WriteOperation[]).map((o) => (
                <OsButton
                  key={o}
                  variant={op === o ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setOp(o);
                    setBaseContent(null);
                    if (o !== "update") setContent("");
                  }}
                  data-testid={`obsidian-write-op-${o}`}
                >
                  {OP_LABEL[o]}
                </OsButton>
              ))}
            </div>
            <label style={stack("var(--os-space-1)")}>
              <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>נתיב בכספת (‎.md)</span>
              <input data-testid="obsidian-write-path" style={{ ...inputStyle, ...codeStyle }} value={path} aria-label="נתיב הקובץ בכספת" placeholder="Folder/Note.md" onChange={(e) => setPath(e.target.value)} />
            </label>
            {!pathSafe && path.trim().length > 0 && (
              <div role="alert" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-danger, #c0392b)" }}>
                נתיב לא חוקי — חייב להיות נתיב יחסי לכספת המסתיים ב-‎.md, ללא ‎../‎, נתיב מוחלט או ‎.obsidian.
              </div>
            )}
            {needsBase && (
              <div style={row}>
                {loading ? (
                  <OsButton variant="ghost" size="sm" disabled disabledReason="טוען…">
                    טען נוכחי
                  </OsButton>
                ) : pathSafe ? (
                  <OsButton variant="ghost" size="sm" onClick={loadCurrent} data-testid="obsidian-write-load">
                    טען נוכחי
                  </OsButton>
                ) : (
                  <OsButton variant="ghost" size="sm" disabled disabledReason="הזינו נתיב תקין">
                    טען נוכחי
                  </OsButton>
                )}
                <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>
                  {baseContent === null ? "יש לטעון את התוכן הנוכחי (לגילוי התנגשויות)" : "התוכן הנוכחי נטען ✓"}
                </span>
              </div>
            )}
            <label style={stack("var(--os-space-1)")}>
              <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>{op === "append" ? "בלוק להוספה (Markdown)" : "תוכן מוצע (Markdown)"}</span>
              <textarea data-testid="obsidian-write-content" style={{ ...inputStyle, minHeight: 140, resize: "vertical" }} value={content} aria-label="תוכן הכתיבה" onChange={(e) => setContent(e.target.value)} />
            </label>
            <div style={row}>
              <OsButton variant="ghost" onClick={onClose}>
                ביטול
              </OsButton>
              {composeInvalid ? (
                <OsButton variant="primary" disabled disabledReason="השלימו נתיב תקין, תוכן, וטעינת נוכחי (לעדכון/הוספה)">
                  צור הצעת כתיבה
                </OsButton>
              ) : (
                <OsButton variant="primary" onClick={propose} data-testid="obsidian-write-propose">
                  צור הצעת כתיבה
                </OsButton>
              )}
            </div>
          </div>
        )}

        {step === "preview" && proposal && (
          <div style={stack()} data-testid="obsidian-write-preview">
            <div style={metaRow}>
              <span style={muted}>פעולה</span>
              <span style={{ fontWeight: 600 }}>{OP_LABEL[proposal.operation]}</span>
            </div>
            <div style={metaRow}>
              <span style={muted}>כספת</span>
              <span>{proposal.vaultName}</span>
            </div>
            <div style={metaRow}>
              <span style={muted}>נתיב</span>
              <span style={codeStyle}>{proposal.path}</span>
            </div>
            <div role="note" style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-warning, #b8860b)" }} data-testid="obsidian-write-warning">
              השינוי יתבצע בקובץ המקומי ב-Obsidian. פעולה חד-פעמית באישור אנושי — <b>אינה סנכרון</b>.
            </div>
            {proposal.operation === "create" && (
              <div style={stack("var(--os-space-1)")}>
                <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>מסמך חדש</span>
                <pre style={{ ...preStyle, ...codeStyle }}>{proposal.proposedContent}</pre>
              </div>
            )}
            {proposal.operation === "update" && (
              <div style={stack("var(--os-space-1)")}>
                <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>הבדלים (לפני → אחרי)</span>
                <DiffView before={proposal.baseContent ?? ""} after={proposal.proposedContent ?? ""} />
              </div>
            )}
            {proposal.operation === "append" && (
              <div style={stack("var(--os-space-1)")}>
                <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>בלוק שיתווסף לסוף הקובץ</span>
                <pre style={{ ...preStyle, ...codeStyle }}>{proposal.appendBlock}</pre>
              </div>
            )}
            {!writePaired && (
              <div style={stack("var(--os-space-1)")} data-testid="obsidian-write-keypair">
                <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-warning, #b8860b)" }}>
                  נדרשת הרשאת כתיבה נפרדת: ב-Obsidian הפעילו “Copy TERAGON write key (once)” והדביקו כאן. אסימון
                  ההתאמה לבדו אינו מספיק לכתיבה.
                </span>
                <div style={row}>
                  <input
                    data-testid="obsidian-write-key-input"
                    type="password"
                    autoComplete="off"
                    style={{ ...inputStyle, ...codeStyle, maxWidth: 260 }}
                    value={writeKeyInput}
                    aria-label="מפתח הרשאת כתיבה"
                    placeholder="מפתח כתיבה…"
                    onChange={(e) => setWriteKeyInput(e.target.value)}
                  />
                  {writeKeyInput.trim() ? (
                    <OsButton variant="primary" size="sm" onClick={pairWriteKey} data-testid="obsidian-write-key-pair">
                      אמת הרשאת כתיבה
                    </OsButton>
                  ) : (
                    <OsButton variant="primary" size="sm" disabled disabledReason="הדביקו את מפתח הכתיבה">
                      אמת הרשאת כתיבה
                    </OsButton>
                  )}
                </div>
              </div>
            )}
            <div style={row}>
              <OsButton variant="ghost" onClick={reject} data-testid="obsidian-write-reject">
                דחה
              </OsButton>
              {busy ? (
                <OsButton variant="approve" disabled disabledReason="כותב…">
                  כותב…
                </OsButton>
              ) : writePaired ? (
                <OsButton variant="approve" onClick={approveAndWrite} data-testid="obsidian-write-approve">
                  אשר כתיבה ל-Obsidian
                </OsButton>
              ) : (
                <OsButton variant="approve" disabled disabledReason="נדרשת הרשאת כתיבה (מפתח כתיבה)">
                  אשר כתיבה ל-Obsidian
                </OsButton>
              )}
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div style={stack()} data-testid="obsidian-write-result">
            {result.state === "WRITTEN" && (
              <div style={stack("var(--os-space-2)")}>
                <StatusChip status="הושלם" label="נכתב ל-Obsidian" />
                <div data-testid="obsidian-write-success" style={{ fontSize: "var(--os-text-sm, 13px)" }}>
                  נכתב ל-Obsidian ואומת בקריאה חוזרת.
                </div>
                <div style={metaRow}>
                  <span style={muted}>hash</span>
                  <span style={codeStyle}>{result.resultHash?.slice(0, 16)}…</span>
                </div>
              </div>
            )}
            {result.state === "CONFLICT" && (
              <div style={stack("var(--os-space-2)")}>
                <StatusChip status="אזהרה" label="התנגשות" />
                <div role="alert" data-testid="obsidian-write-conflict" style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-warning, #b8860b)" }}>
                  הקובץ השתנה מאז התצוגה המקדימה. יש לרענן ולבדוק מחדש.
                </div>
                <OsButton variant="primary" size="sm" onClick={resetCompose} data-testid="obsidian-write-restart">
                  התחל מחדש
                </OsButton>
              </div>
            )}
            {result.state === "REJECTED" && <div style={{ fontSize: "var(--os-text-sm, 13px)", ...muted }}>הכתיבה נדחתה — לא בוצע שינוי בכספת.</div>}
            {result.state === "FAILED" && (
              <div role="alert" style={{ fontSize: "var(--os-text-sm, 13px)", color: "var(--os-danger, #c0392b)" }}>
                הכתיבה נכשלה. לא הוצג אישור הצלחה. נסו שוב מאוחר יותר.
              </div>
            )}
            <div style={row}>
              <OsButton variant="ghost" onClick={onClose}>
                סגירה
              </OsButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
