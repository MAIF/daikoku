# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI; it infers `MAIF/daikoku` from the repo remote.

## Conventions

- Create: `gh issue create --title "..." --body "..."`
- Read: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open --json number,title,body,labels,comments`
- Comment: `gh issue comment <number> --body "..."`
- Apply/remove labels: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- Close: `gh issue close <number> --comment "..."`

For sub-issues, use `gh issue create --parent <parent>` or `gh issue edit <parent> --add-sub-issue <child>`. If unavailable, put `Part of #<parent>` in the child body.

## Pull requests as a triage surface

**PRs as a request surface: no.** Change this to `yes` only if external PRs should be triaged as feature requests.

## Wayfinding

Use a GitHub issue labelled `wayfinder:map` as the map and link child issues as sub-issues (or with a task list and `Part of #<map>`). Use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, and `wayfinder:task` for child types. Record blockers with native issue dependencies when available; otherwise write `Blocked by: #<n>` in the child body.
