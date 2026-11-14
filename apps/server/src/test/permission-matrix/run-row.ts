import { expect } from 'vitest';
import { databaseSnapshot } from '../../db/test-support';
import { jsonHeaders, type TestApp } from '../test-app';
import { createActor } from './actors';
import type { ChannelKind, MatrixRow, RowContext } from './matrix';

/**
 * Creates the row's Channel and the actor's relationship to it (author, Channel admin,
 * member, or none). The first Channel slice supplies it.
 */
export type ChannelFixtures = (
  kind: ChannelKind,
  ctx: Omit<RowContext, 'channel'>,
) => Promise<{ id: string }>;

const noChannelFixturesYet: ChannelFixtures = () => {
  throw new Error('Channel fixtures arrive with the first Channel slice (#31).');
};

/**
 * Runs one matrix row through the real app. An allow row asserts the status. A deny row
 * asserts the status and that the database is unchanged.
 */
export async function runRow(
  testApp: TestApp,
  row: MatrixRow,
  channelFixtures: ChannelFixtures = noChannelFixturesYet,
): Promise<void> {
  const actor = await createActor(testApp, row.actor);
  const channel = row.channel === null ? undefined : await channelFixtures(row.channel, { actor });
  const request = row.request({ actor, channel });

  const before = row.expect.allow ? undefined : await databaseSnapshot();
  const res = await testApp.app.request(request.path, {
    method: request.method ?? 'GET',
    headers: jsonHeaders({ cookie: actor.cookie }),
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  });

  expect(res.status, `${row.route} as ${row.actor}: ${row.action}`).toBe(row.expect.status);
  if (before) {
    expect(await databaseSnapshot(), `${row.route} as ${row.actor} changed the database`).toEqual(
      before,
    );
  }
}
