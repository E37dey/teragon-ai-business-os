// W8-D — build metadata, honest by construction.
// The client can only report what the build actually supplied. There is no
// VITE_APP_VERSION / VITE_BUILD_COMMIT define in vite.config.ts today, so both
// report "לא סופק בזמן build" until the Integration Lead adds the defines
// (queued in docs/integration-requests-w8d.md). vite mode IS always real.
import type { BuildInformation } from "@/domain/system-health";

export const BUILD_VALUE_NOT_SUPPLIED_HE = "לא סופק בזמן build";

function readDefine(name: string): string | null {
  // vite/client types import.meta.env with an index signature; values only
  // exist when a define/env var was supplied at build time.
  const raw: unknown = (import.meta.env as Record<string, unknown>)[name];
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

export function collectBuildInformation(): BuildInformation {
  const version = readDefine("VITE_APP_VERSION");
  const commit = readDefine("VITE_BUILD_COMMIT");
  return {
    mode: import.meta.env.MODE,
    appVersion: version ?? BUILD_VALUE_NOT_SUPPLIED_HE,
    commit: commit ?? BUILD_VALUE_NOT_SUPPLIED_HE,
    detailHe:
      version === null || commit === null
        ? "גרסה/קומיט לא סופקו כ-define בזמן ה-build — מדווח ביושר; בקשת אינטגרציה פתוחה ל-Lead"
        : "מטא-נתוני build סופקו במלואם בזמן הבנייה",
  };
}
