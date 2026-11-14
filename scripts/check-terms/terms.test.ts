import { describe, expect, it } from 'vitest';
import { findBannedTerms, scanFile } from './terms.ts';

const config = { banned: ['ticket', 'notification', 'todo', 'obs'], exceptions: [] };

describe('findBannedTerms', () => {
  it('flags a banned word inside a camelCase identifier', () => {
    expect(findBannedTerms('openTicketCount', config)).toEqual(['ticket']);
  });

  it('flags a banned word inside a snake_case SQL name', () => {
    expect(findBannedTerms('staff_notification_id', config)).toEqual(['notification']);
  });

  it('matches whole words only', () => {
    expect(findBannedTerms('observeTodoistObsolete', config)).toEqual([]);
  });

  it('splits acronyms and file names', () => {
    expect(findBannedTerms('HTTPTicketClient', config)).toEqual(['ticket']);
    expect(findBannedTerms('apps/web/src/features/todo/list-view.tsx', config)).toEqual(['todo']);
  });

  it('flags plural forms of a banned word', () => {
    expect(findBannedTerms('unreadNotifications', config)).toEqual(['notification']);
    expect(findBannedTerms('open_tickets', config)).toEqual(['ticket']);
  });

  it('skips a name listed as an exception', () => {
    const withException = {
      ...config,
      exceptions: [{ match: 'obsValue', reason: 'third-party field name' }],
    };
    expect(findBannedTerms('obsValue', withException)).toEqual([]);
    expect(findBannedTerms('obsCount', withException)).toEqual(['obs']);
  });
});

describe('scanFile', () => {
  it('reports banned identifiers in TypeScript with their line, ignoring strings and comments', () => {
    const source = [
      '// a ticket in a comment is fine',
      "const label = 'ticket text is fine';",
      'export function loadTicket(id: string) {',
      '  return id;',
      '}',
    ].join('\n');
    expect(scanFile('apps/server/src/features/thread/queries.ts', source, config)).toEqual([
      {
        path: 'apps/server/src/features/thread/queries.ts',
        line: 3,
        name: 'loadTicket',
        terms: ['ticket'],
      },
    ]);
  });

  it('reports banned names in migration SQL, ignoring comments and string literals', () => {
    const sql = [
      '-- tickets are mentioned here',
      'CREATE TABLE staff_notification (',
      "  label text DEFAULT 'todo'",
      ');',
    ].join('\n');
    expect(scanFile('apps/server/src/db/migrations/0001_init.sql', sql, config)).toEqual([
      {
        path: 'apps/server/src/db/migrations/0001_init.sql',
        line: 2,
        name: 'staff_notification',
        terms: ['notification'],
      },
    ]);
  });

  it('reports a banned word in the file path', () => {
    expect(scanFile('apps/web/src/features/todo/index.ts', '', config)).toEqual([
      {
        path: 'apps/web/src/features/todo/index.ts',
        line: 0,
        name: 'apps/web/src/features/todo/index.ts',
        terms: ['todo'],
      },
    ]);
  });
});
