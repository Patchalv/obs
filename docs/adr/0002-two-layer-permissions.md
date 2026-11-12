# Permissions are enforced twice: in the server, then by Postgres row-level security

**Status:** accepted

Threads carry employee and child PII, and a leaked Private channel is the worst failure Ping can have.

Every request is first authorised by a single, thoroughly tested permissions module in the server. Postgres row-level security then acts as a backstop on private-channel data, so that even a buggy query cannot return rows the user may not see. The front end only hides controls and is never trusted.

We deliberately did not rely on RLS alone (the Supabase pattern). That pattern exists because there the browser queries the database directly. Ping has a server, so the server is the main gate and RLS is insurance. The cost is maintaining two layers that must agree, so tests have to exercise both.
