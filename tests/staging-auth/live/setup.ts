/// <reference types="node" />
// Live staging-auth suite guard (fail-hard, never skip). Throws at import time
// unless STAGING_AUTH_LIVE=1 and the required config is present. The default
// (non-live) suite never includes this folder, so no skips ever appear there.
import { assertStagingAuthLiveOrThrow } from "./env";

assertStagingAuthLiveOrThrow();
