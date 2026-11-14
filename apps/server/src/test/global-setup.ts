// Integration project globalSetup: migrations run once, as the owner, into a template
// database with the real roles and policies. Workers clone it in worker-setup.ts.
import { buildTemplate } from '../db/test-support';

export default async function setup(): Promise<void> {
  await buildTemplate();
}
