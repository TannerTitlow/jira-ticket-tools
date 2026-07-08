---
description: Review implementation coverage for a Jira issue export directory and append a report in the issue markdown.
agent: general
---

You are running a Jira implementation coverage review for the current repository.

This command is documentation-only.
Allowed file update scope: `docs/jira-exports/$ARGUMENTS/$ARGUMENTS.md` only.
Do not edit source code, tests, config, or any other file in this flow.

Issue key: `$ARGUMENTS`

If no issue key is provided, stop and return a one-line usage hint:
`/jira-review PROJ-1234`

Use these paths:
- `issue_dir="docs/jira-exports/$ARGUMENTS"`
- `issue_md="$issue_dir/$ARGUMENTS.md"`

If `issue_md` does not exist, stop and tell the user:
`Jira export not found at docs/jira-exports/$ARGUMENTS/$ARGUMENTS.md. Run /jira-plan $ARGUMENTS first.`

Otherwise:

1. Read `issue_md` and extract all requirements/description items and acceptance criteria.
2. Inspect the current codebase (and current changes, if any) for coverage evidence.
3. Append a new markdown section to `issue_md` titled:
   - `## Review Report (YYYY-MM-DD HH:MM)`
4. In that section, include:
   - a short analysis summary of how current implementation aligns to the issue description
   - a checklist for each distinct actionable item (especially Acceptance Criteria items when present)
   - status label per item: `Implemented`, `Discussed`, or `Open`
   - file path evidence for implemented items
   - explicit follow-up question for each open item
5. Save the updated `issue_md`.
6. Return a concise summary to the user of what was added to `issue_md`.

Checklist format requirement:

- Use markdown task items (`- [x]` / `- [ ]`).
- Prefix each task line with the status in bold (for example `**Implemented**`).
- Keep one distinct requirement per checklist item.
