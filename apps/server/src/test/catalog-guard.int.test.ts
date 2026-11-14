// The catalog guard: CI fails if the migrated schema lets either app role around
// row-level security. Run against the template's schema, as the owner.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, createScratchDatabase, dropDatabase } from '../db/test-support';
import { findCatalogViolations } from './catalog';

describe('catalog guard', () => {
  it('finds no violations in the migrated schema', async () => {
    expect(await asOwner(findCatalogViolations)).toEqual([]);
  });
});

// Proves the guard can fail: every check is broken once in a scratch clone.
describe('catalog guard on a broken schema', () => {
  const roleName = `ping_test_role_${randomUUID().slice(0, 8)}`;
  const missingRole = `ping_test_missing_${randomUUID().slice(0, 8)}`;
  let scratch: string;
  let violations: string[];

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    violations = await asOwner(async (query) => {
      await query('create table public.no_rls (id int)');
      await query('create table public.rls_not_forced (id int)');
      await query('alter table public.rls_not_forced enable row level security');
      await query(`create policy p on public.rls_not_forced using (true)`);
      await query('create table public.no_policy (id int)');
      await query('alter table public.no_policy enable row level security');
      await query('alter table public.no_policy force row level security');
      await query('create table public.app_owned (id int)');
      await query('alter table public.app_owned owner to ping_app');
      await query(
        'create function public.unlisted() returns int language sql security definer set search_path = pg_catalog as $$ select 1 $$',
      );
      await query(
        `create or replace function public.current_staff_is_admin() returns boolean
           language sql stable security definer as $$ select false $$`,
      );
      // Roles are cluster-wide, so the role checks run against a throwaway role, never
      // by changing ping_app or ping_system under other tests' feet.
      await query(`create role ${roleName} superuser bypassrls`);
      await query(`grant ping_app to ${roleName}`);
      return findCatalogViolations(query, ['ping_app', roleName, missingRole]);
    }, scratch);
  });

  afterAll(async () => {
    await dropDatabase(scratch);
    await asOwner((query) => query(`drop role if exists ${roleName}`));
  });

  it.each([
    'table no_rls lacks row-level security',
    'table no_rls lacks FORCE ROW LEVEL SECURITY',
    'table no_rls has no policy',
    'table rls_not_forced lacks FORCE ROW LEVEL SECURITY',
    'table no_policy has no policy',
    'role ping_app owns public.app_owned',
    'SECURITY DEFINER function unlisted is not in the allowlist',
    'SECURITY DEFINER function current_staff_is_admin has no pinned search_path',
  ])('reports: %s', (violation) => {
    expect(violations).toContain(violation);
  });

  it('reports a role that is a superuser, bypasses RLS, is a member of another role, or is missing', () => {
    expect(violations).toEqual(
      expect.arrayContaining([
        `role ${roleName} is a superuser`,
        `role ${roleName} has BYPASSRLS`,
        `role ${roleName} is a member of ping_app`,
        `role ${missingRole} is missing`,
      ]),
    );
  });
});
