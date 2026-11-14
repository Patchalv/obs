// zod schemas and types shared by apps/server and apps/web. Never imports server code.

export type HealthzResponse = {
  status: 'ok';
};
