---
name: jira-issue-implementation
description: Jira issue key analysis (for example PROJ-1234) in any repository. Use when the user gives a Jira ticket and wants to know what code changes are needed; fetch markdown via jira-ticket-tools first, then map requirements to the current codebase.
---

# Jira Issue Implementation Review

Use this skill when the user provides a Jira issue key (such as `PROJ-1234`) and asks what needs to be implemented in the current project.

## Goal

Turn Jira issue details into a concrete, codebase-specific implementation plan.

## Workflow

1. Identify the Jira issue key from the user request.
2. Use the current repo local docs path:
   - `issue_dir="docs/jira-exports/ISSUE_KEY"`
   - `issue_md="$issue_dir/ISSUE_KEY.md"`
3. If `issue_md` does not exist, generate it using:

```bash
mkdir -p "docs/jira-exports/ISSUE_KEY" && jtt export "ISSUE_KEY" "docs/jira-exports/ISSUE_KEY"
```

4. Read `issue_md` and extract:
   - scope and acceptance criteria
   - UI/API/data model changes
   - dependencies, edge cases, and unknowns
5. Investigate the current repository (the user's working repo) to find the exact files/systems that are impacted.
6. Produce a practical implementation breakdown with:
   - specific files/modules likely to change
   - backend/frontend/test updates needed
   - risks and assumptions
   - a short step-by-step execution plan
7. If implementation work is performed in-session, do a final reconciliation pass against `issue_md` before finishing:
   - mark each requirement/acceptance item as `Implemented`, `Discussed`, or `Open`
   - include file-path evidence for implemented items
   - call out any uncovered description content that still needs decisions

## Output requirements

- Keep recommendations codebase-specific (do not stay generic).
- Reference concrete paths and components when possible.
- Clearly separate:
  - what is already present in the codebase
  - what must be added or changed
  - what remains unclear from the ticket and needs clarification
- End with a coverage checklist against the Jira markdown description when implementation occurred.

## Boundaries

- Default behavior is analysis and planning, not editing code, unless the user asks to implement.
- If the ticket content conflicts with existing architecture patterns, recommend the closest aligned approach and call out tradeoffs.
