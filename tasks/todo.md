# WC2026 Predictor — Task Index

Detailed plans are split into focused files. Start here, pick the right one.

## Plans

- **[mvp-plan.md](mvp-plan.md)** — Detailed build plan for the MVP demo (~1 day's work, 5 sample players, 3 hand-authored results). Self-contained; anyone competent can implement it without prior context.
- **[production-plan.md](production-plan.md)** — Build plan for the full tournament system (~3 days spread across registration, build, and dress rehearsal). Assumes the MVP is already built.

## Operating

- **[instructions.md](instructions.md)** — Operator runbook for both MVP demo and Production daily operations. Includes the 5-minute demo walkthrough, daily-ops checklist, common-issue triage, and backup-runner handover template.

## Memory

- **[lessons.md](lessons.md)** — Patterns captured from corrections during the build. Update after any user correction (per [.claude/CLAUDE.md](../.claude/CLAUDE.md) workflow rules).

## Background

- **[../docs/workflow.md](../docs/workflow.md)** — High-level architecture and end-to-end workflow proposal (shareable with leads).
- **[../CLAUDE.md](../CLAUDE.md)** — Project conventions and game-rule invariants.
- **[../asset/](../asset/)** — Source-of-truth rules document and entry sheet template.

## Reading order

If you're picking this up cold:

1. Read [../CLAUDE.md](../CLAUDE.md) for the game's scoring rules and tech stack
2. Read [../docs/workflow.md](../docs/workflow.md) for the system architecture
3. Pick [mvp-plan.md](mvp-plan.md) (to build the demo) or [production-plan.md](production-plan.md) (to build the real thing)
4. Use [instructions.md](instructions.md) once something is running
