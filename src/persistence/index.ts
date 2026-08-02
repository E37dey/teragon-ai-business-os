// TERAGON AI BUSINESS OS — Gate S4: persistence boundary public surface.
//
// Import from here to stay backend-agnostic. NOTE: this module deliberately does
// NOT re-export anything from `./supabase/**` — that tree is reached only via the
// dynamic import inside `getPersistenceRepository`, keeping `@supabase/supabase-js`
// out of the default (LOCAL) bundle.
export {
  PERSISTENCE_PROVIDER,
  DEFAULT_PERSISTENCE_PROVIDER,
  resolvePersistenceProvider,
  type PersistenceProvider,
} from "./provider";
export {
  getPersistenceRepository,
  wrapLocalRepository,
  type PersistenceRepository,
} from "./boundary";
export {
  ok,
  err,
  safeError,
  AsyncStates,
  type RepoResult,
  type SafeError,
  type SafeErrorCode,
  type Page,
  type PageRequest,
  type AsyncState,
  type AsyncStatus,
} from "./result";
