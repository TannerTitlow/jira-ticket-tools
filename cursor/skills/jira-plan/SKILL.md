---
name: jira-plan
description: Build a codebase-specific implementation plan for a Jira issue key (example PROJ-1234). Use when user asks what needs to be implemented from a Jira ticket.
disable-model-invocation: true
---

# Jira Plan Skill

Run this skill with `/jira-plan PROJ-1234`.

## Goal

Generate or reuse a Jira markdown export in the current repository and return a concrete implementation plan.

## Required flow

1. Parse the issue key from the invocation arguments.
2. If missing, return one-line usage:
   - `/jira-plan PROJ-1234`
3. Ensure issue export exists by running:
   - `bash "$HOME/.cursor/skills/jira-plan/scripts/ensure-export.sh" ISSUE_KEY`
4. Read `docs/jira-exports/ISSUE_KEY/ISSUE_KEY.md`.
5. Extract scope, acceptance criteria, and constraints.
6. Investigate this repository and map exact files/modules impacted.
7. Return implementation plan with:
   - likely file/module changes
   - data/API/UI updates
   - tests required
   - risks/unknowns and clarifying questions
   - ordered execution steps

## If implementation occurs in-session

End with a reconciliation checklist against `docs/jira-exports/ISSUE_KEY/ISSUE_KEY.md`:

- mark each item `Implemented`, `Discussed`, or `Open`
- include file path evidence for implemented items
- include follow-up question for each open item

## Notes

- Script `$HOME/.cursor/skills/jira-plan/scripts/ensure-export.sh` uses `$JIRA_TICKET_TOOLS_DIR` if set, then falls back to `$HOME/jira-ticket-tools`.
- Keep output codebase-specific and avoid generic advice.
