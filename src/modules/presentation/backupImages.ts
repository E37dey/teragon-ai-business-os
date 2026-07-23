// W7-F — bundled backup-screenshot assets. APPROACH (documented per the
// mandate): the needed images were COPIED from docs/screenshots/** (the
// canonical QA captures, recorded in each section's backupImage.sourceFile)
// into src/modules/presentation/assets/ and are imported via vite `?url`, so
// the built bundle serves them offline with hashed URLs. docs/screenshots/**
// stays the source of truth; the copies are build inputs only.
import commandCenterUrl from "./assets/backup-command-center.png?url";
import crmUrl from "./assets/backup-crm.png?url";
import approvalEvidenceUrl from "./assets/backup-approval-evidence.png?url";
import approvalPanelUrl from "./assets/backup-approval-panel.png?url";
import learningMetricsUrl from "./assets/backup-learning-metrics.png?url";
import type { BackupAssetKey } from "@/presentation";

export const BACKUP_ASSET_URLS: Readonly<Record<BackupAssetKey, string>> = {
  "command-center": commandCenterUrl,
  crm: crmUrl,
  "approval-evidence": approvalEvidenceUrl,
  "approval-panel": approvalPanelUrl,
  "learning-metrics": learningMetricsUrl,
};
