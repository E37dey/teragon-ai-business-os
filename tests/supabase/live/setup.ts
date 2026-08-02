/// <reference types="node" />
// TERAGON AI BUSINESS OS — LIVE Supabase suite guard (fail-hard, never skip).
//
// This module runs before the live tests (as a Vitest setupFile in the dedicated
// live config, AND imported for side effect by the test files themselves). It
// throws immediately when the live run is not explicitly enabled or when the
// ephemeral Supabase env is incomplete — so a misconfigured CI run FAILS loudly
// instead of silently skipping. The default (non-live) suite never includes this
// folder, so no skips ever appear there.
import { assertLiveOrThrow } from "./helpers";

// Evaluated at import time: throws unless SUPABASE_LIVE_TESTS=1 and all three of
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are present.
assertLiveOrThrow();
