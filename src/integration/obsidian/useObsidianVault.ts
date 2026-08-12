// S14.2 Phase 1 — React hook binding the read-only Vault adapter to /memory UI.
// Explicit, user-triggered actions only. NO background polling, NO retry loops,
// NO auto-refresh timers. Fail-closed: any fault resolves to a typed error state.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConnectionInfo,
  listNotes,
  openInObsidian,
  probeHealth,
  readNote,
  searchNotes,
  type BridgeCode,
  type BridgeErrorCode,
  type BridgeResult,
  type ConnectionInfo,
  type NoteContent,
  type NoteListResult,
  type SearchResult,
} from "./vaultBridgeClient";
import { clearObsidianToken, getObsidianToken, hasObsidianToken, onObsidianAuthExpiry, setObsidianToken } from "./obsidianCredential";
import { forgetDevice as forgetDeviceKey, hasDeviceIdentity } from "./deviceIdentity";
import { reauthenticate, registerDevice } from "./trustedAuth";

export type ConnectionPhase = "disconnected" | "checking" | "connected" | "error";

/** Hebrew, sanitized, honest failure copy — never a raw error/stack. */
export function obsidianErrorMessage(code: BridgeErrorCode | null): string {
  switch (code) {
    case "UNAVAILABLE":
      // Obsidian closed and "bridge plugin disabled" are indistinguishable over
      // the loopback (both = connection refused), so the message covers both.
      return "Obsidian אינו זמין או שהתוסף TERAGON Vault Bridge אינו פעיל.";
    case "TIMEOUT":
      return "הבקשה לא הושלמה בזמן. נסו שוב.";
    case "UNAUTHORIZED":
      // Genuine 401: the local pairing token rotated (Obsidian/plugin restart).
      return "החיבור ל-Obsidian פג. יש להתחבר מחדש.";
    case "ORIGIN_REJECTED":
      return "שגיאת חיבור מאובטח.";
    case "NOT_FOUND":
      return "הפריט לא נמצא בכספת.";
    case "BAD_REQUEST":
      return "בקשה לא תקינה.";
    default:
      return "שגיאת חיבור ל-Obsidian.";
  }
}

interface UseObsidianVault {
  readonly phase: ConnectionPhase;
  readonly info: ConnectionInfo | null;
  readonly lastCheckAt: number | null;
  readonly errorCode: BridgeErrorCode | null;
  readonly busy: boolean;
  connect(token: string): Promise<BridgeResult<ConnectionInfo>>;
  refresh(): Promise<BridgeResult<ConnectionInfo>>;
  /** "בדוק חיבור": verify with token if paired, else probe reachability. */
  check(): Promise<{ reachable: boolean; paired: boolean }>;
  disconnect(): void;
  /** "שכח את המכשיר הזה": delete the local device key + session and return to first-pair. */
  forgetDevice(): Promise<void>;
  search(query: string): Promise<BridgeResult<SearchResult>>;
  read(path: string): Promise<BridgeResult<NoteContent>>;
  list(): Promise<BridgeResult<NoteListResult>>;
  openVault(): void;
  openNote(path: string): void;
}

export function useObsidianVault(): UseObsidianVault {
  const [phase, setPhase] = useState<ConnectionPhase>(() => (hasObsidianToken() ? "checking" : "disconnected"));
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState<BridgeErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const applyConnected = useCallback((data: ConnectionInfo) => {
    if (!mounted.current) return;
    setInfo(data);
    setPhase("connected");
    setLastCheckAt(Date.now());
    setErrorCode(null);
  }, []);

  const applyFault = useCallback((code: BridgeCode) => {
    if (!mounted.current) return;
    setErrorCode(code === "OK" ? "ERROR" : code);
    setPhase("error");
  }, []);

  const verify = useCallback(
    async (token: string, persist: boolean): Promise<BridgeResult<ConnectionInfo>> => {
      setBusy(true);
      const r = await getConnectionInfo(token);
      if (!mounted.current) return r;
      setBusy(false);
      if (r.ok && r.data?.connected) {
        if (persist) setObsidianToken(token);
        applyConnected(r.data);
      } else {
        applyFault(r.code);
      }
      return r;
    },
    [applyConnected, applyFault],
  );

  // On mount: startup auto-reconnect. If a session bearer survives (same tab), verify it —
  // the chokepoint silently re-auths it if the plugin restarted. If there is no bearer but
  // THIS browser is a trusted device (private key in IndexedDB), re-authenticate by
  // challenge-response with NO pairing code. Only a truly untrusted browser lands on the
  // manual first-pair state. Single check, no polling.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = getObsidianToken();
      if (t) {
        await verify(t, false);
        return;
      }
      const trusted = await hasDeviceIdentity();
      if (cancelled || !mounted.current) return;
      if (!trusted) {
        setPhase("disconnected");
        return;
      }
      setPhase("checking"); // "מתחבר ל-Obsidian…"
      const fresh = await reauthenticate();
      if (cancelled || !mounted.current) return;
      if (fresh) await verify(fresh, false);
      else setPhase("disconnected"); // trusted but bridge down/revoked → user can retry/pair
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the CENTRAL auth-expiry broadcast. When any surface (or the bridge
  // chokepoint) detects a genuine 401, the stale token is already cleared for us;
  // this connection must also drop to the reconnect-required state so the UI is
  // never showing a stale "connected" while the token is dead.
  useEffect(() => {
    return onObsidianAuthExpiry(() => {
      if (!mounted.current) return;
      setInfo(null);
      setBusy(false);
      setErrorCode("UNAUTHORIZED");
      setPhase("error");
    });
  }, []);

  // FIRST PAIR: the pasted one-time pairing token bootstraps device trust. We register
  // THIS browser's public key, receive a short-lived session bearer, and then load the
  // connection. The pairing token is used once and never persisted; the persistent
  // credential is the non-exportable device key.
  const connect = useCallback(
    async (bootstrapToken: string): Promise<BridgeResult<ConnectionInfo>> => {
      setBusy(true);
      const reg = await registerDevice(bootstrapToken.trim());
      if (!mounted.current) return { ok: false, code: "ERROR", status: null };
      if (reg.ok) {
        const session = getObsidianToken();
        if (session) return verify(session, false);
      }
      setBusy(false);
      const code: BridgeErrorCode = reg.code === "unavailable" ? "UNAVAILABLE" : reg.code === "denied" ? "UNAUTHORIZED" : "ERROR";
      applyFault(code);
      return { ok: false, code, status: null };
    },
    [verify, applyFault],
  );

  const refresh = useCallback((): Promise<BridgeResult<ConnectionInfo>> => {
    const t = getObsidianToken();
    if (!t) {
      setPhase("disconnected");
      return Promise.resolve({ ok: false, code: "UNAUTHORIZED", status: null });
    }
    return verify(t, false);
  }, [verify]);

  const check = useCallback(async (): Promise<{ reachable: boolean; paired: boolean }> => {
    const t = getObsidianToken();
    if (t) {
      const r = await verify(t, false);
      return { reachable: r.ok || r.code === "UNAUTHORIZED", paired: r.ok };
    }
    // No token yet — probe the loopback so the user learns if the bridge is up.
    setBusy(true);
    const h = await probeHealth();
    if (mounted.current) {
      setBusy(false);
      if (h.ok) setErrorCode(null);
      else applyFault(h.code);
    }
    return { reachable: h.ok, paired: false };
  }, [verify, applyFault]);

  const disconnect = useCallback(() => {
    clearObsidianToken();
    setInfo(null);
    setPhase("disconnected");
    setLastCheckAt(null);
    setErrorCode(null);
  }, []);

  // "שכח את המכשיר הזה": erase the non-exportable device key + deviceId from IndexedDB and
  // the session bearer, returning to the first-pair state. Trust cannot silently return —
  // a new manual pairing is required. Other trusted devices are unaffected.
  const forgetDevice = useCallback(async () => {
    await forgetDeviceKey();
    clearObsidianToken();
    if (!mounted.current) return;
    setInfo(null);
    setPhase("disconnected");
    setLastCheckAt(null);
    setErrorCode(null);
  }, []);

  const guardFault = useCallback(
    (code: BridgeCode) => {
      if (code === "UNAUTHORIZED" || code === "UNAVAILABLE" || code === "TIMEOUT" || code === "ORIGIN_REJECTED") {
        applyFault(code);
      }
    },
    [applyFault],
  );

  const search = useCallback(
    async (query: string): Promise<BridgeResult<SearchResult>> => {
      const t = getObsidianToken();
      if (!t) return { ok: false, code: "UNAUTHORIZED", status: null };
      const r = await searchNotes(query, t);
      if (!r.ok) guardFault(r.code);
      return r;
    },
    [guardFault],
  );

  const read = useCallback(
    async (path: string): Promise<BridgeResult<NoteContent>> => {
      const t = getObsidianToken();
      if (!t) return { ok: false, code: "UNAUTHORIZED", status: null };
      const r = await readNote(path, t);
      if (!r.ok) guardFault(r.code);
      return r;
    },
    [guardFault],
  );

  const list = useCallback(async (): Promise<BridgeResult<NoteListResult>> => {
    const t = getObsidianToken();
    if (!t) return { ok: false, code: "UNAUTHORIZED", status: null };
    const r = await listNotes(t);
    if (!r.ok) guardFault(r.code);
    return r;
  }, [guardFault]);

  const openVault = useCallback(() => {
    if (info) openInObsidian(info.vaultName);
  }, [info]);

  const openNote = useCallback(
    (path: string) => {
      if (info) openInObsidian(info.vaultName, path);
    },
    [info],
  );

  return { phase, info, lastCheckAt, errorCode, busy, connect, refresh, check, disconnect, forgetDevice, search, read, list, openVault, openNote };
}
