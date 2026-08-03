// TERAGON AI BUSINESS OS — Gate S9.2-A1d2a-1B1: REAL server-only Admin adapter
// for the live customer fixture harness (scripts/platform/live-customer-fixtures.mjs).
// =============================================================================
// Uses the repository's validated Supabase Auth Admin strategy: a SERVER-ONLY
// service-role @supabase/supabase-js client (Admin API for auth users + PostgREST
// for canonical profile/membership/customer rows). Bypasses RLS by design for
// fixture setup + teardown ONLY.
//
// HARD rules:
//   • SUPABASE_SERVICE_ROLE_KEY is server-only — this module is NEVER imported
//     from src/, never Vite-exposed, never VITE_-prefixed, never bundled.
//   • No auth.users SQL, no manual password hashing — the Admin API createUser
//     is the ONLY user-creation path.
//   • The key value is never logged/serialized; adapter errors carry a SAFE,
//     redacted message only.
import process from "node:process";

/** True when no VITE_-prefixed env name carries a service-role/secret value. */
export function assertNoServiceRoleInViteEnv(env = process.env) {
  const leaked = Object.keys(env).filter((k) => /^VITE_/.test(k) && /(SERVICE_ROLE|SECRET)/i.test(k));
  return { ok: leaked.length === 0, leaked };
}

/** Redact any JWT / sb_* key material from an error message before it is used. */
export function safeAdminMessage(err) {
  return String(err?.message ?? err ?? "")
    .replace(/eyJ[A-Za-z0-9._-]{10,}/g, "<jwt>")
    .replace(/sb_(secret|publishable|temp)_[A-Za-z0-9]+/g, "<key>")
    .replace(/service_role/gi, "<role>")
    .slice(0, 160);
}

/**
 * @param {Object} [opts]
 * @param {Record<string,string>} [opts.env] defaults to process.env
 * @param {()=>any} [opts.clientFactory] injected @supabase/supabase-js client (tests)
 */
export function createLiveCustomerAdmin({ env = process.env, clientFactory } = {}) {
  const guard = assertNoServiceRoleInViteEnv(env);
  if (!guard.ok) throw new Error(`service-role key must never be VITE_-exposed: ${guard.leaked.join(",")}`);

  // Strip whitespace (newline/CR contamination from secret ingestion) — URLs and
  // keys never contain legitimate whitespace. The admin password is never touched.
  const url = String(env.SUPABASE_URL ?? "").replace(/\s+/g, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\s+/g, ""); // server-only — never logged
  let cached = null;

  async function client() {
    if (clientFactory) return clientFactory();
    if (!url || !key) throw new Error("live admin requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-side)");
    if (!cached) {
      const { createClient } = await import("@supabase/supabase-js");
      cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    }
    return cached;
  }

  const ok = (res, ctx) => {
    if (res?.error) throw new Error(`${ctx}: ${safeAdminMessage(res.error)}`);
    return res?.data ?? null;
  };

  return {
    async findUserByEmail(email) {
      const c = await client();
      for (let page = 1; page <= 25; page++) {
        const { data, error } = await c.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw new Error(`listUsers: ${safeAdminMessage(error)}`);
        const users = data?.users ?? [];
        const hit = users.find((u) => u.email === email);
        if (hit) return { userId: hit.id };
        if (users.length < 200) break;
      }
      return null;
    },
    async createUser({ email, password }) {
      const c = await client();
      const { data, error } = await c.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data?.user) throw new Error(`createUser: ${safeAdminMessage(error) || "no user"}`);
      return { userId: data.user.id };
    },
    async deleteUser(userId) {
      const c = await client();
      const { error } = await c.auth.admin.deleteUser(userId);
      if (error) throw new Error(`deleteUser: ${safeAdminMessage(error)}`);
    },
    async insertProfile({ userId, orgId, roleId, name, email, active }) {
      const c = await client();
      ok(await c.from("profiles").upsert(
        { id: userId, organization_id: orgId, role_id: roleId, name, email, active, status: active ? "פעיל" : "לא פעיל" },
        { onConflict: "id" },
      ), "insertProfile");
    },
    async deleteProfile(userId) {
      const c = await client();
      ok(await c.from("profiles").delete().eq("id", userId), "deleteProfile");
    },
    async insertMembership({ id, orgId, userId, roleId, active }) {
      const c = await client();
      ok(await c.from("memberships").upsert(
        { id, organization_id: orgId, profile_id: userId, role_id: roleId, active },
        { onConflict: "id" },
      ), "insertMembership");
    },
    async deleteMembership(id) {
      const c = await client();
      ok(await c.from("memberships").delete().eq("id", id), "deleteMembership");
    },
    async insertCustomer({ id, orgId, name, type, city, status }) {
      const c = await client();
      ok(await c.from("customers").upsert(
        { id, organization_id: orgId, name, type, city, status },
        { onConflict: "id" },
      ), "insertCustomer");
    },
    async deleteCustomer(id) {
      const c = await client();
      ok(await c.from("customers").delete().eq("id", id), "deleteCustomer");
    },
    /** Existence probe for cleanup verification (returns boolean, never rows). */
    async exists(table, idColumn, idValue) {
      const c = await client();
      const { data, error } = await c.from(table).select(idColumn).eq(idColumn, idValue).maybeSingle();
      if (error) throw new Error(`exists(${table}): ${safeAdminMessage(error)}`);
      return Boolean(data);
    },
  };
}
