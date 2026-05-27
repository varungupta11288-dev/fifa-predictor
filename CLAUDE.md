# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository State

Greenfield. As of this writing the repo contains only:
- [asset/](asset/) — source-of-truth game spec: `WC2026_Predictor_Game_Rules (v1).docx` and `WC2026_Predictor_Entry_Sheet (v1).xlsx`. Treat the rules doc as the product spec.
- [.claude/](.claude/) — workflow instructions and tool permissions.

No `package.json`, source tree, or build pipeline exists yet. When scaffolding, follow the conventions implied by [.claude/settings.local.json](.claude/settings.local.json) (see below) rather than inventing a new stack.

## Intended Stack (inferred from pre-approved commands)

[.claude/settings.local.json](.claude/settings.local.json) pre-approves:
- `npm run build`
- `npx tailwindcss -i ./src/styles/input.css -o ./_site/assets/css/tailwind.css --minify`

This implies a **Node + Tailwind CSS static site** with output directory `_site/` (Eleventy/11ty convention) and Tailwind input at `src/styles/input.css`. Use these paths when creating the initial scaffold; do not pick different ones without a reason.

## Product: WC2026 Predictor Game

A scoring/leaderboard app for the FIFA World Cup 2026 (48 teams, 104 matches, 11 Jun – 19 Jul 2026). Players submit one prediction sheet up-front; the system scores it as real results come in. Full rules live in [asset/WC2026_Predictor_Game_Rules (v1).docx](asset/) — read it before changing any scoring logic. Key invariants:

**Tournament structure** — Group stage: 12 groups × 4 teams = 72 matches. Knockouts: Round of 32 → R16 → QF → SF → Final (plus 3rd-place play-off). 32 advance from groups: 12 winners + 12 runners-up + **8 best third-placed teams**.

**Scoring** (max 960 pts):
| Stage | Points | Per |
|---|---|---|
| Group: correct result only | 3 | match |
| Group: exact score | 5 | match (replaces the 3, not additive) |
| Round of 32 | 5 | team correctly placed |
| Round of 16 | 10 | team correctly placed |
| Quarter-Finals | 15 | team correctly placed |
| Semi-Finals | 20 | team correctly placed |
| Final | 25 | team correctly placed |
| Winner | 30 | one team |

Knockout points are per-team-in-round, **independent of which match or opponent** — a team predicted to reach the QF scores 15 even if it gets there via a different bracket path.

**Tie-breaker** — predicted total goals across all 104 matches, **including extra time, excluding penalty shootouts**. Closest wins; exact tie splits the prize.

## Workflow

Workflow orchestration rules (plan mode, subagents, verification, lessons capture in `tasks/lessons.md`, etc.) are defined in [.claude/CLAUDE.md](.claude/CLAUDE.md) and the parent [../CLAUDE.md](../CLAUDE.md). They apply here — don't duplicate them.
