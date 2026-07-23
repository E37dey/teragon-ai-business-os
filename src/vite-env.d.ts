/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time app version (W9-D REQ-1 define); absent ⇒ honest fallback. */
  readonly VITE_APP_VERSION?: string;
  /** Build-time git commit (W9-D REQ-1 define); absent ⇒ honest fallback. */
  readonly VITE_BUILD_COMMIT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
