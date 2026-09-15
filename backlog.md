# Backlog

Every open item in `util`. How Flow depends on `util` is tracked in Flow's own `backlog.md`.

- One line per item: what it is, then where the argument lives.
- **A finished item is deleted, never checked off.**
- **`## V1` blocks Flow's first release.** **`## After V1`** holds the rest, one subsection per area, the lowest priority last.

## V1

Nothing here blocks Flow's first release.

## After V1

### `fs merge`

- [ ] **`util fs merge --strip-comments`**, an opt-in flag dropping comments from every block it prints. Lived as a `TODO:` inside `commands/fs/merge.js`, where `--help` printed it to anybody running the command; moved out 2026-09-11. Risky for TypeScript, where `@ts-ignore`, `declare const` and type comments each change what the code means, so the flag has to know the language before it strips a line
