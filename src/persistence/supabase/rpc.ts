// TERAGON AI BUSINESS OS — Gate S4: atomic RPC / transaction boundary helper.
//
// When a single logical write must span MULTIPLE rows/tables atomically (e.g.
// closing a service ticket AND appending its repair action in one transaction),
// the adapter must NOT issue two separate client writes (a partial failure would
// leave inconsistent state). Instead it calls a single Postgres RPC — the whole
// operation commits or rolls back inside the database.
//
// This helper wraps `client.rpc(...)` with the same safe-error contract: a raw
// PostgREST/transaction error becomes a SafeError, never a throw at the UI.
import { err, ok, type RepoResult } from "../result";
import { toSafeError } from "./errors";
import type { SupabaseLike } from "./db";

/**
 * Invoke a Postgres function atomically. `T` is the caller's expected return
 * shape; the raw result is passed through a `parse` guard so the UI only ever
 * sees a validated value or a safe error.
 */
export async function callRpc<T>(
  client: SupabaseLike,
  fn: string,
  args: Record<string, unknown>,
  parse: (value: unknown) => T | null,
): Promise<RepoResult<T>> {
  let result: { data: unknown; error: unknown };
  try {
    result = await client.rpc(fn, args);
  } catch (e) {
    return err(toSafeError(e, fn));
  }
  if (result.error) return err(toSafeError(result.error, fn));
  const value = parse(result.data);
  if (value === null) return err(toSafeError(new Error("invalid rpc payload"), fn));
  return ok(value);
}
