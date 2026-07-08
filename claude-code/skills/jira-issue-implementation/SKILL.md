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
3. Resolve Jira tools path:
   - prefer `$JIRA_TICKET_TOOLS_DIR` when set
   - otherwise fallback to `$HOME/jira-ticket-tools`
4. If `issue_md` does not exist, generate it using:

```bash
tools_dir="${JIRA_TICKET_TOOLS_DIR:-$HOME/jira-ticket-tools}" && mkdir -p "docs/jira-exports/ISSUE_KEY" && "$tools_dir/scripts/get-issue-md.sh" "ISSUE_KEY" "docs/jira-exports/ISSUE_KEY/ISSUE_KEY.md"
```

5. Read `issue_md` and extract:
   - scope and acceptance criteria
   - UI/API/data model changes
   - dependencies, edge cases, and unknowns
6. Investigate the current repository (the user's working repo) to find the exact files/systems that are impacted.
7. Produce a practical implementation breakdown with:
   - specific files/modules likely to change
   - backend/frontend/test updates needed
   - risks and assumptions
   - a short step-by-step execution plan
8. If implementation work is performed in-session, do a final reconciliation pass against `issue_md` before finishing:
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
