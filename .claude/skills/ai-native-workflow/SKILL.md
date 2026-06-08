---
name: ai-native-workflow
description: Use to understand the overall way of working in this scaffold — the conversation contract, the task lifecycle, and the principles that keep AI-generated output consistent. The operating manual that ties the other skills together.
---

# AI-Native Workflow (operating manual)

This skill is the _why_ behind the others. `CLAUDE.md` is the table of contents; the per-task skills
are the deep rules; this explains how they fit.

## Three layers

1. **Constitution** (`CLAUDE.md` §1) — hard stops. Refusals, not preferences.
2. **Specialized skills** (`.claude/skills/*`) — deep, phased rules, loaded by the wording of the task.
3. **Code conventions** — the actual TypeScript, read on demand. The code is the truth.

## The conversation contract — audit-then-edit

State → route+explore → **propose (with confidence 1–10)** → human approves → apply → verify → report.
No code before approval (except trivial Direct-Mode fixes, premise verified first). See the Universal
Spine in `AI-WORKFLOWS.md`.

## The confidence gate

Phase-4 proposals carry a 1–10 confidence. **< 5 means you're guessing — don't propose, go explore or
ASK.** This is the single mechanism that prevents invented selectors, endpoints, and folders.

## Five principles that make output consistent

1. **Single source of truth per value class** — URLs/secrets in `config` (env); paths/messages in `enums`; dynamic data in `factories`; invalid data in `static`. Exactly one right home.
2. **Hard-stop forbidden patterns** — the Constitution table triggers refusal, with a concrete alternative each time.
3. **Mandatory exploration** — playwright-cli for UI, OpenAPI for API. No guessing selectors or endpoints.
4. **Strict folder discipline** — every artifact has one home, so keyword→skill routing works.
5. **Phased skills** — you follow the skill's phases instead of inventing a workflow per task.

## How a skill loads itself

Describe the work; the routing table (`CLAUDE.md` §4) picks the first skill, which chains to others.
You rarely name a skill — naming one is the fallback when the wrong one loaded.

## Day-one

1. If `PROJECT.md` is missing, run `bootstrap`. 2. Read `PROJECT.md`. 3. Skim the skill for whatever
   you'll touch first (usually `page-objects` or `api-testing`). 4. State your goal; let the skill load
   and propose; approve / redirect. That loop is the whole job.
