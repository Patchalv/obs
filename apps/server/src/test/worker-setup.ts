// Integration project setupFiles: each Vitest worker gets its own clone of the template.
// Cloning is idempotent, so the next test file in the same worker reuses the clone.
import { beforeAll } from 'vitest';
import { cloneTemplate, workerDatabaseName } from '../db/test-support';

beforeAll(async () => {
  await cloneTemplate(workerDatabaseName());
});
