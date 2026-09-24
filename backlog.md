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

- [ ] **An outline of any file**: the lines that give a file its shape, each with its line number, so the next read aims at one range. Markdown headings, and the functions, classes and exports of JavaScript, TypeScript and Python. Found 2026-09-24 in 586 heading searches (`grep -n '^#'`) across the machine's Claude Code transcripts. Raised by Flow's user the same day, and designed once the build starts, flag name included. **talk first**

### `git work`

- [ ] **Rename it to `util git uncommitted`**: `send`, `get`, `ls` and `drop`. "Work" says nothing about what moves, and what moves is the changes you have not committed. Asked for by Flow's user 2026-09-20. The file is `commands/git/work.js`, and the label it pushes to is `refs/unfinished/<machine>/<branch>`.

- [ ] **`util git uncommitted get <machine> --branch` makes the branch the other machine had.** Today `get` refuses on any branch but the matching one, and on a machine that never had the branch there is nothing to switch to, so the work cannot land. Everything else already travels: a push sends every object the remote lacks, and the copy's parent commits are those objects, so unpushed commits arrive as the copy's ancestors. The flag creates the branch at the copy's parent commit, which is exactly where the other machine's branch tip was, switches to it, then applies the copy's diff the way a plain `get` does. Designed with Flow's user 2026-09-20. An empty branch was rejected there: it points at none of the work.
