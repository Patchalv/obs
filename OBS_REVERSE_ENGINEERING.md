# Obs (OBS 2.0): reverse-engineering notes and rebuild plan

Source: a read-only walkthrough of `https://observaciones.tecs.es/new/obs.asp` on 2026-11-12, logged in as a coordinator (COORD) account. That account had no observations assigned, so list, detail and thread views showed up empty. Every claim below is labelled with how confident it is:

- **Observed**: seen directly in the page, DOM, scripts or HTTP headers.
- **Inferred**: deduced from names, parameters and UI text. Check it against the database before relying on it.
- **Unknown**: needs a populated account or the database to answer.

No mutating endpoints were called.

---

## 1. Tech stack (observed)

| Layer | What's there |
|---|---|
| Server | Microsoft IIS 10, `X-Powered-By: ASP.NET`, pages are **Classic ASP** (`.asp`, VBScript). No ASP.NET MVC or Web API. |
| Database | Not visible from the browser. Classic ASP on IIS almost always means **SQL Server over ADODB**. *(inferred)* |
| Main UI (`/new/obs.asp`) | A single page of about 80 KB HTML with about 50 KB of inline JavaScript. jQuery 2 plus a long tail of 2010-era plugins: jquery.layout, jqxSplitter, jGrowl, tablesorter + pager, contextMenu, thickbox, autocomplete, desknoty (desktop notifications), jquery-blink, watermark, datepicker. |
| Secondary UI (`/new/world/`, `/new/lists/`) | A newer layer built on Bootstrap 3, Modernizr, daterangepicker, footable, ajaxq, SweetAlert2, Highcharts, and custom `tecs.js` / `world.js` / `preguntas.js`. |
| Client/server pattern | About 54 `rpc*.asp`-style endpoints called with `$.get`/`$.post` (76 call sites). They return **HTML fragments** that are injected into panels. There is no JSON API, so business logic and markup are tangled together on the server. |
| Auth | Session cookie with `/login.asp` and `/logout.asp`, plus an in-app "Change Password". Users have their own credentials, with no SSO. *(observed and inferred)* |
| Refresh | A manual "refrescar" button, counters in the header, and desktop notifications through polling. *(inferred, no websockets seen)* |

**Why it's fragile:** VBScript has had no support for years, the inline script makes logic impossible to test, the HTML-fragment RPCs can't be reused by another client, and the original developers have gone.

---

## 2. What the product does

### 2.1 Core concept: the "Observación" (observed names, inferred semantics)

An **observation** is a case/ticket about a subject: a student (`alum`), a family (`familia`/`ffam`) or a company/client (`emp`). Internally it works like a task thread:

- **Responsable**: the staff member who owns it ("Obs Responsable").
- **Seguimiento**: staff following it ("Obs Seguimiento"). A *seguimiento* is also an entry in the thread (`newseg`, `addseg`, `seguirapido`, `rpcfinseg`).
- **Genéricas**: observations not tied to one subject ("Obs Genéricas").
- **Automatismos**: rule-generated observations ("Obs Automatismos", "no tiene automatismos").
- **Pendientes de acción / Pendientes de respuesta**: inbox-style queues for "you need to act" and "waiting for a reply".
- **Respuestas**: replies (`rpcresp`, `rpcguardaresp`, `ver_respuestas_todo`), with up to 4 numbered items per reply (`n1..n4`, `r1..r4`), possibly a questionnaire.
- **Priority** (`prioridad` in quick follow-up) and **colour flags**: 7 coloured flags (`filtroizq(3,'<hex>')`), each with a configurable legend ("Sin Leyenda" when none is set) (`newcolor.asp`).
- **Read tracking**: read/unread per user (`seguileido`/`seguinoleido`, `rpcleidos`, `leidopor.asp` = "read by", `vistomens`).
- **Finish/close**: `finseg`, `cerrartodo`, `cerrartodoseg`, with an "En Finalizadas" search option.
- **Change history**: `histcambio.asp`, `rpccambioob.asp`, `muestrahisob`.
- **Family visibility**: a follow-up can be shared with the family. UI strings: "Ahora la familia puede ver este seguimiento" / "La familia ya no puede ver este seguimiento". **Some of this data is shown to customers through another portal.** *(observed string, inferred mechanism)*
- **Move/convert**: move an observation to a family (`pasar_a_familia`), pass info (`pasar_info`), change client (`cambiocliente`), and migrate from the old Obs 1.0 (`rpcpasarold`, "Ya está en 2.0").
- **Favourites** ("Ya está como favorito").
- **Delays**: `guardaretraso`.

### 2.2 Navigation and search (observed)

- Left panel: "OBS. ASIGNADAS | MIS GRUPOS", so observations can be assigned to **groups** as well as individuals.
- Search box prefixes: `re:` within responsable, `se:` within seguimiento, `id:` by ID, `ge:` generic. With no prefix it searches everything.
- Advanced search: ID, subject (`asunto`), body (`cuerpo`), staff by username or surname, an "include leavers" checkbox (`Baja`), and "include finished".
- Header counters (`0 / 0`) for each queue.
- CREAR opens two create options: an observation, and a **Recado** (internal message/"toque"; see "Toques / Recados recibidos" and "Crear Recado").

### 2.3 Adjacent modules visible from the header and `/new/world/` (observed)

| Area | What it is |
|---|---|
| Recados / Toques | Lightweight internal messages between staff |
| Buzón (`buzon.asp`) | Mailbox / inbox |
| Info requests and bookings | `petinfo`, `petinfoemp`, `reservaemp`: enquiries and reservations from families and companies |
| Family / company / employee files | `ffam2`, `ffamemp`, `empdatos`, `datosempl` |
| Questionnaires | `crearpreg`, `rpchistoricopreg`, `preguntas.js` |
| SMS log | `listarenviosms.asp` |
| Time clock | `registrarEntrada` / `registrarSalida` → `registrohoras.asp`. Clocking in still asks staff to confirm they took their temperature (dead COVID-era logic). |
| REPORTS | Student data lists: accommodation preferences, **medical data**, **diet data**, other. |
| Program menus HO / SC / LT / LC | Per-programme operations: check-in (normal / arrived / modify), TECS Life, printing files, printing obs lists, LC activities and documents. |
| External links | TECS web, TECSP, Sendy (mailing), T.O.P., TECSPOINT, forums |

**Main takeaway:** Obs is not just a messaging tool. It's a **case-management and CRM spine** for an education and travel business, wired into student records, bookings and programme operations.

---

## 3. Inferred domain model

```
Person (staff)  ──< GroupMembership >── Group
   │
   ├─< Observation.responsable
   └─< Follower (seguimiento subscription)

Subject  = Student | Family | Company | (none → genérica)

Observation
  id, subject_type, subject_id, asunto, cuerpo, priority,
  colour_flag, status (open|finished), created_by, responsable_id,
  group_id?, is_automatic, rule_id?, due/retraso, created_at, closed_at

ObservationEntry (seguimiento)        Reply (respuesta)
  observation_id, author_id, body,      entry_id, author_id, body,
  priority, link, visible_to_family,    items[1..4]
  created_at

ReadReceipt(user_id, entry_id, read_at)
ChangeLog(observation_id, field, old, new, user_id, at)
FlagLegend(user_or_team, colour, label)
Recado(from, to, body, read_at)
AutomationRule(trigger, template, assignee)
TimeEntry(user_id, in_at, out_at)
```

## 4. Unknowns: get these before building

1. **Database schema.** This matters most: an export of table and column definitions from SQL Server. It answers almost everything below.
2. Exact state machine: what makes something "pending action" versus "pending response".
3. What fires *automatismos* (triggers, schedules, booking events?).
4. Permission model: what COORD can see compared with other roles; group-level visibility.
5. How "family can see this follow-up" reaches families (which portal, and whether it's the same database).
6. Which notification channels are real (email, SMS, desktop).
7. Data volume (observations per year) and retention rules.

---

## 5. Rebuild recommendation for the sister company

### 5.1 Decide first (these change the architecture)

- **Shared data or a separate tenant?** If the sister company needs the same families, students or staff, build an **API-first service with a shared identity provider**, and later have Obs consume it. If it's fully separate, build greenfield and only copy the *concepts*.
- **Scope.** Don't clone everything 1:1. Ask which modules the sister company actually uses. A sensible MVP is Observations + follow-ups + replies + queues + groups + read receipts + recados. The time clock, check-in, programme menus and SMS can wait.

### 5.2 Suggested architecture

Use a **modular monolith**, not microservices. The team is small and the domain is one cohesive case-management system.

| Concern | Recommendation |
|---|---|
| Language/framework | Use whatever your team can maintain. Two good defaults: **TypeScript (Next.js or NestJS)** or **.NET 8 (ASP.NET Core)**. .NET is the easier move if your IT people are already on Microsoft/IIS/SQL Server. |
| Database | **PostgreSQL** (or stay on SQL Server if that's your existing estate). Use proper foreign keys and an `observation_status` enum. |
| API | A JSON REST (or tRPC) API that the UI consumes. Never return HTML from the API. A future family portal or mobile app can then reuse it. |
| Frontend | A React SPA or Next.js with a table/grid component (TanStack Table). Mobile-friendly from the start. |
| Auth | **Company SSO** (Google Workspace or Microsoft 365 / Entra ID via OIDC). Drop the custom passwords. Use role-based plus group-based authorisation, enforced server-side (or with Postgres row-level security). |
| Real-time | Server-sent events or websockets for counters and new follow-ups, in place of the refresh button and polling. |
| Notifications | An outbox table plus a worker for email/SMS/push, so sending is reliable and retried. |
| Automations | A rules table plus a scheduled worker (cron/queue) that creates observations. Make the rules visible and editable, unlike today's black box. |
| Audit | An append-only `audit_log` written on every change, replacing `histcambio`. |
| Search | Postgres full-text search to begin with. That covers the `re:`/`se:`/`id:`/`ge:` prefixes. |
| Files | Object storage (S3-compatible) for attachments. |
| Hosting | A managed container platform with managed Postgres in the EU, plus automated backups. |
| Compliance | **This holds medical and dietary data about minors.** Under GDPR that is special-category data, so it needs EU data residency, encryption at rest, field-level access control, access logging and a DPIA. Design this in from the start. |

### 5.3 Delivery plan

1. **Discovery (1–2 weeks).** Get the SQL Server schema and run 3–4 interviews with heavy users (coordinator, programme manager, front desk). Write the state machine and permission matrix down.
2. **MVP (6–10 weeks).** Observations, follow-ups, replies, queues, groups, flags, read receipts, recados, SSO, audit log, real-time counters.
3. **Pilot** with one sister-company team. Iterate.
4. **Phase 2.** Automations, family-visible follow-ups / family portal, questionnaires, reports, SMS/email.
5. **Optional.** Migrate TECS Obs itself onto the new platform using the same import path (`rpcpasarold` shows they've done a 1.0 → 2.0 migration before).

### 5.4 Risks

- Hidden business rules live in the VBScript on the server and can't be seen from the browser. **Getting read access to the `.asp` source on the IIS server would de-risk this a lot.** It's worth asking IT for it even though the developers have left.
- Copying the 2010-era UI paradigms too closely (fixed panes, icon-only buttons with no labels).
- Underestimating permissions and data-protection work.
