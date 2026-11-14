// Fake Spark Staff members for local development and the Playwright suite. Never real data.
//
// Every seeded Staff member signs in with SEED_PASSWORD (also in .env.example):
//
//   marta.ruiz@example.com     Admin
//   jordi.puig@example.com     Member
//   laura.gomez@example.com    Member
//   pablo.serra@example.com    Member
//   carlos.vidal@example.com   Deactivated Member (sign-in is refused)
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';

export const SEED_PASSWORD = 'ping-local-dev-password';

type SeedStaff = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  deactivated?: boolean;
};

export const SEED_STAFF: readonly SeedStaff[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Marta Ruiz',
    email: 'marta.ruiz@example.com',
    role: 'admin',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Jordi Puig',
    email: 'jordi.puig@example.com',
    role: 'member',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Laura Gómez',
    email: 'laura.gomez@example.com',
    role: 'member',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Pablo Serra',
    email: 'pablo.serra@example.com',
    role: 'member',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Carlos Vidal',
    email: 'carlos.vidal@example.com',
    role: 'member',
    deactivated: true,
  },
];

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

/**
 * Inserts the seed Staff members as the owner role, skipping any already there. Public
 * sign-up is off, so this writes Better Auth's user and account rows directly.
 */
export async function seed(ownerUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const passwordHash = await hashPassword(SEED_PASSWORD);
    await client.query('begin');
    for (const staff of SEED_STAFF) {
      const inserted = await client.query(
        `insert into "user" (id, name, email, email_verified) values ($1, $2, $3, true)
         on conflict (email) do nothing`,
        [staff.id, staff.name, staff.email],
      );
      if (inserted.rowCount === 0) continue;
      await client.query(
        `insert into account (account_id, provider_id, user_id, password)
         values ($1, 'credential', $2, $3)`,
        [staff.id, staff.id, passwordHash],
      );
      await client.query(
        `insert into staff_member (id, role, invited_by, joined_at) values ($1, $2, $3, now())`,
        [staff.id, staff.role, staff.id === ADMIN_ID ? null : ADMIN_ID],
      );
      if (staff.deactivated) {
        await client.query(
          'update staff_member set deactivated_at = now(), deactivated_by = $2 where id = $1',
          [staff.id, ADMIN_ID],
        );
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}
