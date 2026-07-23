// TERAGON AI BUSINESS OS — ProviderRegistry (Wave 5, W5-A).
// Selection policy: remote-verified → local-fallback-when-permitted →
// structured-unavailable. A fallback is NEVER silent: the selection result
// carries a disclosure object the UI must surface.
//
// Config is injected (typed RegistryConfig). Client code NEVER reads env vars;
// the browser will read a public runtime-config endpoint later (W5-B) and pass
// the resulting flags in here.
import {
  AI_ERROR_MESSAGES_HE,
  type AIErrorCode,
  type AIProvider,
  type AIProviderHealth,
} from "@/ai/contracts/AIProvider";
import type { AuditEvent } from "@/domain/types";
import { getRepository } from "@/repositories/factory";
import { nextId } from "@/repositories/Repository";

export interface RegistryConfig {
  /** Mode B flag — remote provider may be attempted at all */
  remoteEnabled: boolean;
  /** policy: may the local rules engine serve when remote is not verified */
  localFallbackPermitted: boolean;
}

/** The mandatory Hebrew disclosure when remote falls back to local. */
export const FALLBACK_MESSAGE_HE = "הספק המרוחק אינו זמין. המערכת עברה למנוע המקומי מבוסס הכללים.";

export interface FallbackDisclosure {
  from: "remote";
  /** machine-readable reason (health state or error code) */
  reason: string;
  /** the exact Hebrew sentence the UI must show — never silent */
  messageHe: string;
}

export interface ProviderUnavailable {
  code: AIErrorCode;
  messageHe: string;
}

// ---------------------------------------------------------------------------
// W8-E (integration-requests-w8a #3) — fallback is AUDITED, never silent:
// every disclosed remote→local fallback writes an AuditEvent with
// action "ai.fallback" so the ai_fallbacks metric counts REAL events.
// ---------------------------------------------------------------------------

/** Canonical audit action for a disclosed provider fallback. */
export const FALLBACK_AUDIT_ACTION = "ai.fallback";

/** Injectable audit seam — tests inject a memory sink; production writes to auditEvents. */
export interface FallbackAuditSink {
  record(disclosure: FallbackDisclosure): Promise<void>;
}

/** Production sink: one AuditEvent per disclosed fallback into auditEvents. */
export function repositoryFallbackAuditSink(
  now: () => string = () => new Date().toISOString(),
): FallbackAuditSink {
  return {
    async record(disclosure) {
      const repo = getRepository<AuditEvent>("auditEvents");
      const existing = await repo.list();
      const ts = now();
      await repo.create({
        id: nextId("ai-fb", existing.map((a) => a.id)),
        createdAt: ts,
        updatedAt: ts,
        at: ts,
        actor: "system",
        action: FALLBACK_AUDIT_ACTION,
        entityRef: null,
        details: `${disclosure.messageHe} (סיבה: ${disclosure.reason})`,
        correlationId: null,
      });
    },
  };
}

export interface ProviderSelection {
  /** null ⇔ unavailable is non-null (structured unavailability, no fake success) */
  provider: AIProvider | null;
  /** non-null ⇔ the local engine serves INSTEAD of an expected remote */
  fallback: FallbackDisclosure | null;
  /** non-null ⇔ no provider may serve; UI shows the Hebrew message */
  unavailable: ProviderUnavailable | null;
  /** remote health as observed during selection (null when remote disabled) */
  remoteHealth: AIProviderHealth | null;
}

/** Health states that count as server-verified and usable. */
const USABLE_REMOTE_STATES: ReadonlySet<AIProviderHealth["state"]> = new Set([
  "מחובר",
  "חיבור מוגבל",
]);

export class ProviderRegistry {
  private readonly config: RegistryConfig;
  private readonly remote: AIProvider;
  private readonly local: AIProvider;
  private readonly auditSink: FallbackAuditSink;

  constructor(
    config: RegistryConfig,
    providers: { remote: AIProvider; local: AIProvider },
    auditSink: FallbackAuditSink = repositoryFallbackAuditSink(),
  ) {
    this.config = config;
    this.remote = providers.remote;
    this.local = providers.local;
    this.auditSink = auditSink;
  }

  /**
   * Select the serving provider per policy. Never throws for expected
   * degradation — degradation is DATA (fallback / unavailable), not exceptions.
   */
  async select(): Promise<ProviderSelection> {
    if (!this.config.remoteEnabled) {
      // Mode A: local is the PRIMARY engine, not a fallback — no disclosure needed.
      if (this.config.localFallbackPermitted) {
        return { provider: this.local, fallback: null, unavailable: null, remoteHealth: null };
      }
      return {
        provider: null,
        fallback: null,
        unavailable: {
          code: "AI_PROVIDER_NOT_CONFIGURED",
          messageHe: AI_ERROR_MESSAGES_HE.AI_PROVIDER_NOT_CONFIGURED,
        },
        remoteHealth: null,
      };
    }

    // remote enabled — health must be VERIFIED by the server before serving
    let health: AIProviderHealth;
    try {
      health = await this.remote.health();
    } catch {
      health = {
        state: "לא זמין",
        checkedAt: new Date().toISOString(),
        detail: "בדיקת הבריאות עצמה נכשלה",
      };
    }

    if (USABLE_REMOTE_STATES.has(health.state)) {
      return { provider: this.remote, fallback: null, unavailable: null, remoteHealth: health };
    }

    if (this.config.localFallbackPermitted) {
      const fallback: FallbackDisclosure = {
        from: "remote",
        reason: health.state,
        messageHe: FALLBACK_MESSAGE_HE,
      };
      // W8-E: the fallback is audited (action "ai.fallback"); audit failure
      // must never break the selection itself — degradation stays served.
      try {
        await this.auditSink.record(fallback);
      } catch {
        // audit is best-effort here; the disclosure object itself is mandatory
      }
      return {
        provider: this.local,
        fallback,
        unavailable: null,
        remoteHealth: health,
      };
    }

    return {
      provider: null,
      fallback: null,
      unavailable: {
        code: codeForHealthState(health.state),
        messageHe: AI_ERROR_MESSAGES_HE[codeForHealthState(health.state)],
      },
      remoteHealth: health,
    };
  }
}

/** Map an unusable health state to its stable error code. */
function codeForHealthState(state: AIProviderHealth["state"]): AIErrorCode {
  switch (state) {
    case "לא הוגדר":
      return "AI_PROVIDER_NOT_CONFIGURED";
    case "שגיאת אימות":
      return "AI_PROVIDER_AUTH_FAILED";
    case "מגבלת תקציב":
      return "AI_DAILY_BUDGET_EXCEEDED";
    case "מושבת":
      return "AI_PROVIDER_NOT_CONFIGURED";
    default:
      return "AI_PROVIDER_UNAVAILABLE";
  }
}
