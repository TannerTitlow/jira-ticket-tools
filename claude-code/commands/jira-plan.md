You are helping with Jira implementation planning for the current repository.

Issue key: `$ARGUMENTS`

If no issue key is provided, stop and return a one-line usage hint:
`/jira-plan PROJ-1234`

Otherwise:

1. Use these paths:
   - `issue_key="$ARGUMENTS"`
   - `issue_dir="docs/jira-exports/$ARGUMENTS"`
   - `issue_md="$issue_dir/$ARGUMENTS.md"`
2. If `issue_md` does not exist, create it by running:

```bash
mkdir -p "docs/jira-exports/$ARGUMENTS" && jtt export "$ARGUMENTS" "docs/jira-exports/$ARGUMENTS/$ARGUMENTS.md"
```

3. Read `issue_md` and extract scope, acceptance criteria, and constraints.
4. Investigate the current codebase to map exactly what needs to change.
5. Return a concise implementation plan with:
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
