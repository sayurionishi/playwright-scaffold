---
name: common-tasks
description: Use as the entry point when the request is a generic "how do I add X?" or "generate a prompt for Y", or when no other skill obviously matches. Routes to the right specialized skill.
---

# Common Tasks (router)

When the ask is generic, classify it and hand off to the specialized skill that owns the deep rules.

| The user wants…                 | Hand off to                   | First move                        |
| ------------------------------- | ----------------------------- | --------------------------------- |
| Configure a fresh clone         | `bootstrap`                   | check `PROJECT.md` exists         |
| A page object / new screen      | `page-objects`                | `ls pages/`, then explore         |
| A functional UI test            | `test-standards`              | split into behaviors              |
| An e2e journey                  | `test-standards`              | map the journey in playwright-cli |
| API tests for an endpoint       | `api-testing`                 | Phase-1 tool gate, then OpenAPI   |
| Security / fuzzing tests        | `security-testing`            | enumerate input fields            |
| A locator chosen/fixed          | `selectors`                   | explore the live element          |
| A flake fixed                   | `wait-strategy` → `debugging` | classify the wait                 |
| A Zod schema / kill an `any`    | `type-safety`                 | source the contract               |
| A factory / invalid data        | `data-strategy`               | classify the value kind           |
| A fixture wired                 | `fixtures`                    | page-object vs helper             |
| An endpoint/route/message added | `enums`                       | verify live, then add             |
| An env var / URL / secret       | `config`                      | env vs enums                      |

## Generate-a-prompt requests

If asked to produce a reusable prompt for a teammate/Copilot, write it to point at the relevant
SKILL.md and the Constitution (CLAUDE.md §1), include the explore-first rule and the confidence gate,
and list the hard stops that apply to that task.

## If nothing matches

Ask one clarifying question. Don't guess a skill — wrong routing wastes a whole cycle.
