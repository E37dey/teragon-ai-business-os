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
import { clearObsidianToken, getObsidianToken, hasObsidianToken, setObsidianToken } from "./obsidianCredential";

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
      return "נדרש חיבור מחדש.";
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

  // On mount, restore a session-paired connection with a SINGLE check (no polling).
  useEffect(() => {
    const t = getObsidianToken();
    if (t) void verify(t, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback((token: string) => verify(token.trim(), true), [verify]);

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

  return { phase, info, lastCheckAt, errorCode, busy, connect, refresh, check, disconnect, search, read, list, openVault, openNote };
}
