---
paths:
  - "apps/web/**"
---

# Touching the web app

- **Typed client only.** Call the server through the `hc` client in `apps/web/src/lib/api.ts`. No hand-written `fetch` to API paths.
- **Server code is types only.** `apps/web` imports from `@ping/server` with `import type` and nothing else; dependency-cruiser fails any runtime import.
- **No permission logic** beyond hiding controls the user can't use. The server decides; the front end is never trusted.
- **Shared schemas:** reuse the zod schemas in `packages/shared` for forms.
- **Screens and flows** follow `docs/spec/screens.md`. Use the Impeccable skill for design work; its detector runs after every edit here.
- **Check it in the browser** before the PR: start `ping-dev` from `.claude/launch.json`, sign in as a seeded Staff member, and exercise the change. Say what you checked under **Browser check** in the PR.
