/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time app version (W9-D REQ-1 define); absent ⇒ honest fallback. */
  readonly VITE_APP_VERSION?: string;
  /** Build-time git commit (W9-D REQ-1 define); absent ⇒ honest fallback. */
  readonly VITE_BUILD_COMMIT?: string;
  /**
   * Gate S4 — persistence provider selection. Absent/unknown ⇒ LOCAL_INDEXEDDB
   * (the default). Only "SUPABASE" opts into the remote provider.
   */
  readonly VITE_PERSISTENCE_PROVIDER?: "LOCAL_INDEXEDDB" | "SUPABASE";
  /** Gate S4 — Supabase project URL (PUBLIC). Used only when provider=SUPABASE. */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * Gate S4 — Supabase PUBLIC anon key. NEVER a service-role key. Used only when
   * provider=SUPABASE (lazy-loaded), so it is absent from the default bundle.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Gate S4 — active tenant/organization id for the Supabase provider. */
  readonly VITE_SUPABASE_ORG?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
