// The catalog guard's checks. It reads pg_catalog and lists every way the database could
// let ping_app or ping_system past row-level security (docs/spec/testing.md).
//
// Changing either allowlist weakens the guard: list it under **Permission changes** in the PR.
import type { Query } from '../db/test-support';

/** Better Auth's tables, the only tables in public without row-level security. */
export const TABLES_WITHOUT_RLS = ['account', 'session', 'user', 'verification'];

/**
 * Every SECURITY DEFINER function: the system functions (permissions.md › System
 * functions) and the policy helpers. Each must pin its search_path.
 */
export const SECURITY_DEFINER_FUNCTIONS = [
  // Policy helper: is the acting Staff member an active Admin?
  'current_staff_is_admin',
];

const APP_ROLES = ['ping_app', 'ping_system'];

/** `appRoles` is overridable only so the guard's own test can use a throwaway role. */
export async function findCatalogViolations(
  query: Query,
  appRoles: string[] = APP_ROLES,
): Promise<string[]> {
  const violations: string[] = [];

  const roles = await query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
    'select rolname, rolsuper, rolbypassrls from pg_roles where rolname = any($1)',
    [appRoles],
  );
  for (const name of appRoles) {
    const role = roles.rows.find((r) => r.rolname === name);
    if (!role) violations.push(`role ${name} is missing`);
    else {
      if (role.rolsuper) violations.push(`role ${name} is a superuser`);
      if (role.rolbypassrls) violations.push(`role ${name} has BYPASSRLS`);
    }
  }

  // Membership would hand a role another role's attributes or ownership.
  const memberships = await query<{ member: string; granted: string }>(
    `select m.rolname as member, g.rolname as granted
       from pg_auth_members a
       join pg_roles m on m.oid = a.member
       join pg_roles g on g.oid = a.roleid
      where m.rolname = any($1)`,
    [appRoles],
  );
  for (const { member, granted } of memberships.rows) {
    violations.push(`role ${member} is a member of ${granted}`);
  }

  const owned = await query<{ owner: string; relname: string; nspname: string }>(
    `select pg_get_userbyid(c.relowner) as owner, c.relname, n.nspname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where pg_get_userbyid(c.relowner) = any($1)`,
    [appRoles],
  );
  for (const { owner, nspname, relname } of owned.rows) {
    violations.push(`role ${owner} owns ${nspname}.${relname}`);
  }

  const tables = await query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    policies: number;
  }>(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity,
            (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`,
  );
  for (const table of tables.rows) {
    if (TABLES_WITHOUT_RLS.includes(table.relname)) continue;
    if (!table.relrowsecurity) violations.push(`table ${table.relname} lacks row-level security`);
    if (!table.relforcerowsecurity) {
      violations.push(`table ${table.relname} lacks FORCE ROW LEVEL SECURITY`);
    }
    if (table.policies === 0) violations.push(`table ${table.relname} has no policy`);
  }

  // Every SECURITY DEFINER function outside the system schemas, wherever it lives.
  const definers = await query<{ nspname: string; proname: string; proconfig: string[] | null }>(
    `select n.nspname, p.proname, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef
        and n.nspname not in ('pg_catalog', 'information_schema')
        and n.nspname not like 'pg\\_%'`,
  );
  for (const fn of definers.rows) {
    const name = fn.nspname === 'public' ? fn.proname : `${fn.nspname}.${fn.proname}`;
    if (!SECURITY_DEFINER_FUNCTIONS.includes(name)) {
      violations.push(`SECURITY DEFINER function ${name} is not in the allowlist`);
    }
    if (!(fn.proconfig ?? []).some((setting) => setting.startsWith('search_path='))) {
      violations.push(`SECURITY DEFINER function ${name} has no pinned search_path`);
    }
  }

  return violations;
}
