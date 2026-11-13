# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

There is no application code yet, so there are no build, lint or test commands. The repo holds only planning and domain docs. Add commands here once a stack is chosen.

## What this is

**Ping** is Spark's internal staff tool for communication and work tracking (Channels, Threads, Thread Responses, Pings, Saved). It is a new product inspired by TECS Obs (OBS 2.0), a Classic ASP case-tracking app, but it shares no data, terminology or design with it.

- `GLOSSARY.md`: the canonical domain language. Use its terms in code, issues, tests and docs, and avoid the synonyms it lists under _Avoid_ (for example: Thread, not ticket or post; Ping, not notification; Thread Response, not reply; Deactivated, not deleted).
- `OBS_REVERSE_ENGINEERING.md`: read-only notes on how TECS Obs works, with each claim tagged Observed, Inferred or Unknown. Treat it as background research, not a spec. Its Spanish/Obs vocabulary (observación, seguimiento, responsable, recado) must not leak into Ping's code or docs.
- `docs/adr/`: architecture decisions, created as they are made (none yet).

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Patchalv/ping`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
