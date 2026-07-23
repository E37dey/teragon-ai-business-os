// W8-E — boot application of the interface settings (integration-requests-w8d
// #3). Without this, density applies only after visiting /settings. The lead
// wires ONE call into src/main.tsx after seedIfEmpty/migrations (main.tsx is
// lead-only — the request is queued in docs/integration-requests-w8e.md):
//
//   import { applyUiSettingsAtBoot } from "@/integration/wave8/applyUiSettings";
//   void applyUiSettingsAtBoot();
//
// Boot must NEVER fail because of a preference — errors are swallowed and the
// function reports honestly whether the settings were applied.
import {
  applyUiSettings,
  productionSettingsStores,
  readSettingsRecord,
  type SettingsStores,
} from "@/modules/settings/settingsStore";

export async function applyUiSettingsAtBoot(
  stores: SettingsStores = productionSettingsStores(),
  doc: Document | null = null,
): Promise<boolean> {
  try {
    const record = await readSettingsRecord(stores);
    applyUiSettings(record, doc);
    return true;
  } catch {
    // a broken settings record must never block boot — density stays default
    return false;
  }
}
