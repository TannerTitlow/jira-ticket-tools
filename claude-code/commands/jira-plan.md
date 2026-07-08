You are helping with Jira implementation planning for the current repository.

Issue key: `$ARGUMENTS`

If no issue key is provided, stop and return a one-line usage hint:
`/jira-plan PROJ-1234`

Otherwise:

1. Use these paths:
   - `issue_key="$ARGUMENTS"`
   - `issue_dir="docs/jira-exports/$ARGUMENTS"`
   - `issue_md="$issue_dir/$ARGUMENTS.md"`
2. Resolve Jira tools path in shell:
   - prefer `$JIRA_TICKET_TOOLS_DIR` when set
   - otherwise fallback to `$HOME/jira-ticket-tools`
3. If `issue_md` does not exist, create it by running:

```bash
tools_dir="${JIRA_TICKET_TOOLS_DIR:-$HOME/jira-ticket-tools}" && mkdir -p "docs/jira-exports/$ARGUMENTS" && "$tools_dir/scripts/get-issue-md.sh" "$ARGUMENTS" "docs/jira-exports/$ARGUMENTS/$ARGUMENTS.md"
```

4. Read `issue_md` and extract scope, acceptance criteria, and constraints.
5. Investigate the current codebase to map exactly what needs to change.
6. Return a concise implementation plan with:
   - likely files/modules to update
   - data/API/UI behavior changes
   - test coverage updates needed
   - risks/unknowns and clarifying questions
   - ordered execution steps

If implementation work is done during this run, finish with a reconciliation pass against `issue_md`:

- Build a coverage checklist from the description and acceptance criteria.
- Mark each item as `Implemented`, `Discussed`, or `Open`.
- For `Implemented`, include concrete file path evidence.
- For `Open`, include the exact follow-up question to ask the user.

Prefer concrete file paths and existing project conventions over generic advice.
