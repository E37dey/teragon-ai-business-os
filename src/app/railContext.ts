// Rail context + hook — separated so rail.tsx only exports components (fast-refresh).
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export interface RailApi {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
  /**
   * When true, a page has opted OUT of the shell intelligence rail entirely so
   * the workspace canvas spans full width. Dense workspace pages (e.g. /courses)
   * that own their own contextual layout use this instead of the shared rail.
   */
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
}

export const RailContext = createContext<RailApi | null>(null);

export function useRailContent(): ReactNode | null {
  return useContext(RailContext)?.content ?? null;
}

export function useRailHidden(): boolean {
  return useContext(RailContext)?.hidden ?? false;
}

export function useRailApi(): RailApi | null {
  return useContext(RailContext);
}
