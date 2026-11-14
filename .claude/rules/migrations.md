---
paths:
  - "apps/server/src/db/**"
---

# Touching the database layer

The rules are in `docs/spec/permissions.md` and `docs/spec/data-model.md`, and in ADRs 0002 and 0004. When you touch `apps/server/src/db/`, also do this:

- **Expand/contract.** A migration must work with the previous release's code, because the old code briefly runs against the new schema. Add first, and remove or rename in a later PR.
- **Every new table gets, in the same migration:**
  - `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`;
  - its policies for `ping_app` (and `ping_system` where it writes);
  - RLS-suite cases for SELECT, INSERT, UPDATE and DELETE.
  The catalog guard fails CI on a table without them.
- **Applied migrations are immutable.** A migration that exists on `origin/master` can't be edited; a hook blocks it. Write a new migration instead.
- **Raw connections live only here.** `withStaffTx()` owns the `ping_app` pool. The `ping_system` pool is only for `system-actions/`. dependency-cruiser enforces both.
- **Names** follow `GLOSSARY.md`: singular snake_case tables (`thread_response`), and no banned terms (`pnpm check:terms` reads migration SQL).
- **Never weaken a guard** (RLS expectations, catalog-guard allowlists) unless the issue says so. List any such change under **Permission changes** in the PR.
