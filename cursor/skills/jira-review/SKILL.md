---
name: jira-review
description: Documentation-only Jira coverage review for an issue key (example PROJ-1234). Use when user wants review status appended to the issue markdown without further implementation.
disable-model-invocation: true
---

# Jira Review Skill

Run this skill with `/jira-review PROJ-1234`.

## Goal

Append a structured coverage report to the issue markdown and do not change code.

## Required flow

1. Parse issue key from invocation arguments.
2. If missing, return one-line usage:
   - `/jira-review PROJ-1234`
3. Validate issue export exists by running:
   - `bash "$HOME/.cursor/skills/jira-review/scripts/require-export.sh" ISSUE_KEY`
4. Read `docs/jira-exports/ISSUE_KEY/ISSUE_KEY.md`.
5. Compare issue requirements and acceptance criteria against current implementation.
6. Append to the issue markdown:
   - `## Review Report (YYYY-MM-DD HH:MM)`
   - short alignment summary
   - checklist of distinct actionable requirements
   - item status: `Implemented`, `Discussed`, or `Open`
   - file path evidence for implemented items
   - follow-up question for each open item
7. Save the markdown file and summarize what was added.

## Hard boundary

- Documentation-only: edit `docs/jira-exports/ISSUE_KEY/ISSUE_KEY.md` only.
- Do not edit source code, tests, or configs in this flow.

## Checklist format

- Use markdown task items (`- [x]` / `- [ ]`).
- Prefix each item with bold status, for example `**Implemented**`.
- Keep one requirement per checklist item.
