// TERAGON AI BUSINESS OS — log redaction (Wave 5, W5-B).
// EVERY server log line passes through redact(). Anything shaped like a key,
// secret, or bearer token is masked BEFORE it can reach a log sink. This is a
// last line of defense — secrets should never enter log calls to begin with.

export { REDACTED, redact, redactValue } from "@/lib/redact";
import { redactValue } from "@/lib/redact";

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
