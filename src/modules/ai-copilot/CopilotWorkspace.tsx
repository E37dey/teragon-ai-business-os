// W5-D — AI Copilot workspace (Phase 5.9): a drawer openable from anywhere.
// Command-mapped only (no free forwarding), provider badge on EVERY answer,
// per-response fallback disclosure, business-context chips, affected records,
// evidence, proposed actions → the canonical ApprovalPanel, cancellation,
// retry, Hebrew errors from AI_ERROR_MESSAGES_HE.
// Conversation history persistence: localStorage (module-scoped key) — the
// choice and its rationale are documented in docs/integration-requests-w5d.md.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Drawer, EmptyState, GlowOrb, OsButton, OsIcon, useToast } from "@/design-system";
import type { AIProviderHealthState } from "@/ai/contracts/AIProvider";
import { AIError } from "@/ai/contracts/AIProvider";
import type { FallbackDisclosure } from "@/ai/providers/registry";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import type { Customer, Lead, ServiceTicket } from "@/domain/types";
import { AgentGovernanceError } from "@/agents";
import { useCollection, invalidateCollections } from "@/app/data/hooks";
import { CEO_USER_ID } from "@/repositories/seed";
import {
  EnvelopeCard,
  InjectionWarning,
  ProviderStateBadge,
  detectInjection,
  getAgentEngine,
  startGuardedRun,
} from "@/components/ai";
import { ApprovalPanel } from "@/components/approval";
import {
  COPILOT_COMMANDS,
  EMPTY_CHIPS,
  matchCommand,
  UNSUPPORTED_COMMAND_HE,
  type AffectedRecord,
  type CopilotContextChips,
  type ProposedAction,
} from "./commands";
import { useCopilot } from "./copilotApi";

const STORAGE_KEY = "teragon.copilot.history.v1";

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  at: string;
  text?: string;
  commandId?: string;
  envelope?: AIResponseEnvelopeV2;
  fallback?: FallbackDisclosure | null;
  errorHe?: string;
  retryText?: string;
  injection?: string[];
  affected?: AffectedRecord[];
  proposedAction?: ProposedAction | null;
  runId?: string;
  approvalId?: string;
  unsupported?: boolean;
}

function loadHistory(): StoredMessage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredMessage[]) : [];
  } catch {
    return [];
  }
}

function localTodayIso(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function errorHe(err: unknown): string {
  if (err instanceof AIError) return err.userMessageHe;
  if (err instanceof AgentGovernanceError) return err.userMessageHe;
  if (err instanceof Error) return err.message;
  return "שגיאה לא מזוהה";
}

let msgSeq = 0;
function nextMsgId(): string {
  msgSeq += 1;
  return `cm-${Date.now()}-${msgSeq}`;
}

export default function CopilotWorkspace(): ReactElement {
  const { open, closeCopilot } = useCopilot();
  const { toast } = useToast();
  const [messages, setMessages] = useState<StoredMessage[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<CopilotContextChips>(EMPTY_CHIPS);
  const [health, setHealth] = useState<AIProviderHealthState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const leadsQ = useCollection<Lead>("leads");
  const customersQ = useCollection<Customer>("customers");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const leads = leadsQ.data ?? [];
  const customers = customersQ.data ?? [];
  const tickets = ticketsQ.data ?? [];

  // persist history (module-scoped localStorage)
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // storage full/unavailable — history simply not persisted this session
    }
  }, [messages]);

  // provider health for the header badge
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const selection = await getAgentEngine().registry.select();
      if (cancelled) return;
      if (selection.provider) {
        const h = await selection.provider.health();
        if (!cancelled) setHealth(h.state);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // autoscroll on new messages
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  const append = useCallback((msg: StoredMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const runCommand = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (trimmed === "" || busy) return;
      const now = new Date().toISOString();
      append({ id: nextMsgId(), role: "user", at: now, text: trimmed });
      setInput("");

      // 1) deterministic injection heuristics — flagged input is NOT forwarded
      const findings = detectInjection(trimmed);
      if (findings.length > 0) {
        append({
          id: nextMsgId(),
          role: "assistant",
          at: new Date().toISOString(),
          injection: findings.map((f) => f.labelHe),
        });
        return;
      }

      // 2) command mapping — no arbitrary forwarding
      const command = matchCommand(trimmed);
      if (command === null) {
        append({
          id: nextMsgId(),
          role: "assistant",
          at: new Date().toISOString(),
          unsupported: true,
        });
        return;
      }

      // 3) execute the mapped operation (cancellable)
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const outcome = await command.execute({
          stores: getAgentEngine().stores,
          chips,
          todayIso: localTodayIso(),
          signal: controller.signal,
        });
        append({
          id: nextMsgId(),
          role: "assistant",
          at: new Date().toISOString(),
          commandId: command.id,
          envelope: outcome.envelope,
          fallback: outcome.fallback,
          affected: outcome.affected,
          proposedAction: outcome.proposedAction,
        });
      } catch (err) {
        append({
          id: nextMsgId(),
          role: "assistant",
          at: new Date().toISOString(),
          commandId: command.id,
          errorHe: errorHe(err),
          retryText: trimmed,
        });
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [append, busy, chips],
  );

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const requestApprovalFor = async (messageId: string, action: ProposedAction): Promise<void> => {
    setBusy(true);
    try {
      const lead = leads.find((l) => l.id === action.leadId);
      const result = await startGuardedRun({
        goal: `שליחת הודעת מעקב ל${lead ? `-${lead.name}` : `ליד ${action.leadId}`}`,
        requestedById: CEO_USER_ID,
        plan: [
          {
            agentId: "ag-hunter",
            operation: "recommend.follow-up",
            domain: "leads",
            titleHe: "טיוטת הודעת מעקב לאישור",
            relatedEntities: [{ type: "lead", id: action.leadId }],
          },
        ],
        approval: {
          action: "customer-message",
          executionPayload: {
            kind: "external",
            action: "customer-message",
            descriptionHe: `שליחת הודעת מעקב לליד ${lead?.name ?? action.leadId}`,
            data: {
              leadId: action.leadId,
              draft: action.draft,
              subjectRef: `lead:${action.leadId}`,
            },
          },
          previewHe: action.draft.slice(0, 200),
        },
      });
      if (result.approval) {
        const runId = result.run.id;
        const approvalId = result.approval.id;
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, runId, approvalId } : m)),
        );
        toast("נוצרה בקשת אישור — ההחלטה אנושית", "info");
      } else {
        toast("הריצה הושלמה ללא צורך באישור", "success");
      }
      await invalidateCollections([
        "agentRuns",
        "agentTasks",
        "agentEvents",
        "approvals",
        "auditEvents",
        "agentMessages",
        "agentHandoffs",
      ]);
    } catch (err) {
      toast(errorHe(err), "danger");
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = useCallback(() => {
    setMessages([]);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const chipSelect = (
    labelHe: string,
    value: string | null,
    options: readonly { id: string; label: string }[],
    onChange: (id: string | null) => void,
  ): ReactElement => (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: "var(--os-text-2xs, 11px)",
        color: "var(--os-text-2)",
      }}
    >
      {labelHe}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        style={{ maxInlineSize: 150 }}
      >
        <option value="">— ללא —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Drawer open={open} onClose={closeCopilot} title="AI Copilot — העוזר החכם שלך">
      <div
        data-testid="copilot-workspace"
        style={{ display: "grid", gap: "var(--os-space-3)", blockSize: "100%" }}
      >
        {/* header: provider state + demo label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--os-space-2)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <GlowOrb size={28} accent="cyan" />
            <ProviderStateBadge provider="local-rules" healthState={health} />
          </div>
          <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            מצב הדגמה מקומי
          </span>
        </div>

        {/* business-context chips */}
        <div
          style={{
            display: "flex",
            gap: "var(--os-space-3)",
            flexWrap: "wrap",
            border: "1px solid var(--os-border)",
            borderRadius: "var(--os-radius-sm, 6px)",
            paddingBlock: "var(--os-space-2)",
            paddingInline: "var(--os-space-3)",
          }}
        >
          {chipSelect(
            "לקוח",
            chips.customerId,
            customers.map((c) => ({ id: c.id, label: c.name })),
            (id) => setChips((prev) => ({ ...prev, customerId: id })),
          )}
          {chipSelect(
            "ליד",
            chips.leadId,
            leads.map((l) => ({ id: l.id, label: l.name })),
            (id) => setChips((prev) => ({ ...prev, leadId: id })),
          )}
          {chipSelect(
            "קריאת שירות",
            chips.ticketId,
            tickets.map((t) => ({ id: t.id, label: `${t.issue} (${t.customerName})` })),
            (id) => setChips((prev) => ({ ...prev, ticketId: id })),
          )}
        </div>

        {/* conversation */}
        <div
          ref={listRef}
          style={{
            display: "grid",
            gap: "var(--os-space-3)",
            overflowY: "auto",
            maxBlockSize: "48vh",
            paddingInlineEnd: 4,
          }}
        >
          {messages.length === 0 && (
            <EmptyState
              icon="sparkle"
              title="אין שיחה עדיין"
              reason="בחרו אחת מהפקודות הנתמכות למטה או הקלידו אותה. קלט חופשי שאינו פקודה ממופה לא יישלח למנוע."
            />
          )}
          {messages.map((m) => (
            <div key={m.id} data-testid={`copilot-msg-${m.role}`}>
              {m.role === "user" ? (
                <div
                  style={{
                    justifySelf: "start",
                    fontSize: "var(--os-text-sm, 13px)",
                    background: "var(--os-highlight)",
                    border: "1px solid var(--os-border)",
                    borderRadius: "var(--os-radius-md, 8px)",
                    paddingBlock: "var(--os-space-2)",
                    paddingInline: "var(--os-space-3)",
                  }}
                >
                  {m.text}
                </div>
              ) : (
                <div style={{ display: "grid", gap: "var(--os-space-2)" }}>
                  {m.injection && (
                    <InjectionWarning findings={m.injection.map((labelHe) => ({ labelHe }))} />
                  )}
                  {m.unsupported && (
                    <div
                      style={{
                        fontSize: "var(--os-text-sm, 13px)",
                        color: "var(--os-text-2)",
                        border: "1px solid var(--os-border)",
                        borderRadius: "var(--os-radius-md, 8px)",
                        paddingBlock: "var(--os-space-3)",
                        paddingInline: "var(--os-space-3)",
                        display: "grid",
                        gap: 6,
                      }}
                      data-testid="copilot-unsupported"
                    >
                      <strong style={{ color: "var(--os-text)" }}>{UNSUPPORTED_COMMAND_HE}</strong>
                      <span>הפקודות הנתמכות כרגע:</span>
                      <ul style={{ margin: 0, paddingInlineStart: "1.2em" }}>
                        {COPILOT_COMMANDS.map((c) => (
                          <li key={c.id}>{c.textHe}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {m.errorHe && (
                    <div
                      role="alert"
                      style={{
                        display: "grid",
                        gap: 6,
                        fontSize: "var(--os-text-sm, 13px)",
                        color: "var(--os-danger)",
                        border: "1px solid var(--os-danger-border, var(--os-border))",
                        borderRadius: "var(--os-radius-md, 8px)",
                        paddingBlock: "var(--os-space-2)",
                        paddingInline: "var(--os-space-3)",
                      }}
                    >
                      <span>{m.errorHe}</span>
                      {m.retryText &&
                        (!busy ? (
                          <OsButton
                            variant="ghost"
                            size="sm"
                            onClick={() => void runCommand(m.retryText ?? "")}
                          >
                            נסה שוב
                          </OsButton>
                        ) : (
                          <OsButton variant="ghost" size="sm" disabled disabledReason="פעולה רצה…">
                            נסה שוב
                          </OsButton>
                        ))}
                    </div>
                  )}
                  {m.envelope && (
                    <EnvelopeCard
                      envelope={m.envelope}
                      fallback={m.fallback ?? null}
                      actions={
                        <div style={{ display: "grid", gap: "var(--os-space-2)" }}>
                          {m.affected && m.affected.length > 0 && (
                            <div
                              style={{
                                fontSize: "var(--os-text-2xs, 11px)",
                                color: "var(--os-text-2)",
                              }}
                            >
                              רשומות רלוונטיות:{" "}
                              {m.affected.map((a) => `${a.labelHe} (${a.id})`).join(" · ")}
                            </div>
                          )}
                          {m.proposedAction &&
                            !m.approvalId &&
                            (!busy ? (
                              <OsButton
                                variant="violet"
                                size="sm"
                                icon="shield"
                                onClick={() =>
                                  void requestApprovalFor(m.id, m.proposedAction as ProposedAction)
                                }
                              >
                                {m.proposedAction.labelHe}
                              </OsButton>
                            ) : (
                              <OsButton
                                variant="violet"
                                size="sm"
                                disabled
                                disabledReason="פעולה רצה…"
                              >
                                {m.proposedAction.labelHe}
                              </OsButton>
                            ))}
                          {m.runId && m.approvalId && (
                            <ApprovalPanel runId={m.runId} approvalId={m.approvalId} compact />
                          )}
                        </div>
                      }
                    />
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "var(--os-text-sm, 13px)",
                color: "var(--os-text-2)",
              }}
            >
              <OsIcon name="sparkle" size={14} />
              הפקודה רצה…
              <OsButton variant="ghost" size="sm" onClick={cancelInFlight}>
                בטל בקשה
              </OsButton>
            </div>
          )}
        </div>

        {/* supported commands */}
        <div style={{ display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap" }}>
          {COPILOT_COMMANDS.map((c) =>
            busy ? (
              <OsButton key={c.id} variant="ghost" size="sm" disabled disabledReason="פקודה רצה…">
                {c.textHe}
              </OsButton>
            ) : (
              <OsButton
                key={c.id}
                variant="ghost"
                size="sm"
                onClick={() => void runCommand(c.textHe)}
              >
                {c.textHe}
              </OsButton>
            ),
          )}
        </div>

        {/* input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runCommand(input);
          }}
          style={{ display: "flex", gap: "var(--os-space-2)" }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="הקלידו פקודה נתמכת… (קלט חופשי אינו מועבר למנוע)"
            aria-label="פקודת Copilot"
            data-testid="copilot-input"
            style={{ flex: 1 }}
          />
          {busy ? (
            <OsButton variant="primary" size="sm" disabled disabledReason="פקודה רצה…">
              שלח
            </OsButton>
          ) : (
            <OsButton
              variant="primary"
              size="sm"
              icon="send"
              onClick={() => void runCommand(input)}
            >
              שלח
            </OsButton>
          )}
        </form>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            ההיסטוריה נשמרת מקומית בדפדפן (localStorage)
          </span>
          {messages.length > 0 ? (
            <OsButton variant="ghost" size="sm" onClick={clearHistory}>
              נקה היסטוריה
            </OsButton>
          ) : (
            <OsButton variant="ghost" size="sm" disabled disabledReason="אין היסטוריה למחוק">
              נקה היסטוריה
            </OsButton>
          )}
        </div>
      </div>
    </Drawer>
  );
}
