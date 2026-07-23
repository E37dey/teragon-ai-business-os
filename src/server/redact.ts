// TERAGON AI BUSINESS OS — log redaction (Wave 5, W5-B).
// EVERY server log line passes through redact(). Anything shaped like a key,
// secret, or bearer token is masked BEFORE it can reach a log sink. This is a
// last line of defense — secrets should never enter log calls to begin with.

export const REDACTED = "[REDACTED]";

/**
 * Patterns that mask candidate secrets. Order matters: specific token shapes
 * first, generic key=value shapes last.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  // OpenAI/Anthropic-style keys: sk-..., sk-ant-..., sk-proj-...
  /\bsk-[A-Za-z0-9_-]{4,}\b/g,
  // AWS-style access key ids
  /\bAKIA[A-Z0-9]{12,}\b/g,
  // JWT: three base64url segments starting with eyJ
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g,
  // Bearer <token>
  /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{8,}/g,
  // key/secret/token/password/authorization = or : value
  /\b(api[_-]?key|apikey|secret|token|password|passwd|authorization|x-api-key)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"',;&]+)/gi,
];

/** Redact secret-shaped substrings from a single string. */
export function redact(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, ...groups) => {
      // generic key=value pattern keeps the key name, masks only the value
      if (groups.length >= 3 && typeof groups[0] === "string" && typeof groups[1] === "string") {
        return `${groups[0]}${groups[1]}${REDACTED}`;
      }
      void match;
      return REDACTED;
    });
  }
  return out;
}

/** Deep-redact any JSON-serializable value (strings inside objects/arrays). */
export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // key names that ARE secrets get their value fully masked regardless of shape
      out[k] = /^(api[_-]?key|apikey|secret|token|password|passwd|authorization)$/i.test(k)
        ? REDACTED
        : redactValue(v);
    }
    return out;
  }
  return value;
}

export type ServerLogLevel = "info" | "warn" | "error";

export interface ServerLogSink {
  write(line: string): void;
}

const consoleSink: ServerLogSink = {
  write(line: string) {
    // eslint-disable-next-line no-console
    console.log(line);
  },
};

/**
 * Structured, redacted server log. All W5-B code logs through this — never
 * through console.* directly — so redaction cannot be bypassed by accident.
 */
export function serverLog(
  level: ServerLogLevel,
  event: string,
  fields: Record<string, unknown>,
  sink: ServerLogSink = consoleSink,
): string {
  const line = JSON.stringify(
    redactValue({ level, event, ts: new Date().toISOString(), ...fields }),
  );
  sink.write(line);
  return line;
}
