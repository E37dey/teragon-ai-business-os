// Rail context + hook — separated so rail.tsx only exports components (fast-refresh).
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export interface RailApi {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
}

export const RailContext = createContext<RailApi | null>(null);

export function useRailContent(): ReactNode | null {
  return useContext(RailContext)?.content ?? null;
}

export function useRailApi(): RailApi | null {
  return useContext(RailContext);
}
