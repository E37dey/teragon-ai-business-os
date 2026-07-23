// W5-D — provider display labels (pure helpers, shared with tests).
export const LOCAL_PROVIDER_LABEL_HE = "מנוע מקומי מבוסס כללים";
export const REMOTE_PROVIDER_LABEL_HE = "ספק AI מרוחק מחובר";

/** The only sanctioned provider-id → Hebrew label mapping. */
export function providerLabelHe(provider: string): string {
  return provider === "local-rules" ? LOCAL_PROVIDER_LABEL_HE : REMOTE_PROVIDER_LABEL_HE;
}
