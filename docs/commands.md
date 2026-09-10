# Commands

What this repository ships. `util ls` prints the same list off the disk, and `--help` on any of them prints that command's own header comment.

## Table of contents

- [Every command](#every-command)
- [The `open` block](#the-open-block)
- [Moving uncommitted work](#moving-uncommitted-work)
- [Reading what Claude Code sends](#reading-what-claude-code-sends)

## Every command

Every command prints its own file header for `--help`, opening with one line saying what it does. Every command also refuses a flag it cannot use, rather than running on with that flag ignored.

**`claude`**

- **`proxy`**: record every request Claude Code sends to the model.

**`fs`**

- **`tree [path]`**: print a folder as a tree, hiding `node_modules`, `.git` and other build folders. Each entry carries its own `description:` line.
- **`merge <path>...`**: print many files as one text, each in a code block labelled with its path. `src/parser.js:40-120` takes a line range, `--ext` and `--except` filter, `--force` prints past the 2000-line limit.
- **`open <file>`**: print a document, then every file its `open` block lists.
- **`link <source> <target>`**: make a symlink, refusing to replace a real file.

**`git`**, aliased `g`

- **`save`**: add, commit and push in one step.
- **`work`**: move the changes you have not committed to another machine.

**`github`**, aliased `gh`

- **`clone <repo>...`**: clone repositories from GitHub, named by URL or by `owner/repo`.
- **`bookmark <repo>`**: add a repository's stars, language and last push date to a file.

Three of them do something a one-line description cannot cover.

## The `open` block

**A block you write inside a document, holding the paths of other files.** One command prints that document, and turns the list of paths into the full contents of the files.

Write the block anywhere in the document, one path per line. Here it sits inside `docs/notes.md`:

````
# Notes

... file content

```open
plan.md
src/parser.js:2-4   # the middle bit
```
````

Then run the command on the document holding it, from the project root:

```bash
util fs open docs/notes.md
```

Out comes the document, then both files:

`````
open: docs/notes.md and 2 files, 23 lines

```` docs/notes.md
# Splitting the parser

The tokenizer and the builder are one file. Pull the builder out.

```open
plan.md
src/parser.js:2-4   # the middle bit
```

Next session: start at step 2.
````

``` docs/plan.md
step 1: read the tokenizer
step 2: split the builder out
```

``` src/parser.js:2-4
b
c
d
```
`````

One command in place of three reads. **`docs/notes.md` is never modified.** It is copied into the output, whole, ahead of everything its block named.

Three things that output shows:

- **The label on a block is the path**, relative to the directory the command ran in. `plan.md` in the block resolved to `docs/plan.md`, beside the document.
- **The fence grows to fit.** `docs/notes.md` holds a three-backtick fence, so its own block opens with four. Nothing inside a file can close the block early.
- **No language beside the path.** The extension is already sitting there.

`util fs merge docs/notes.md docs/plan.md src/parser.js:2-4` prints the same thing. The block is that command line, saved inside the document instead of typed out on every run.

Handoffs, specs, design notes and tickets are what this is for. Somebody opens one of them knowing nothing, and has to open four other files before it means anything. The block is those four files, listed by whoever already knew which ones they were.

- **One path per line.** A `#` note beside it is stripped, and so is a blank line.
- **A line range works**: `src/parser.js:2-4` gives lines 2 to 4.
- **A path resolves beside the document first, then from the working directory.** A document names its neighbours by bare filename.
- **A named file that no longer exists prints as missing**, and every other file still prints.
- **Nothing is truncated.** Somebody wrote the list by hand, so its length is a decision already made.
- **`--files-only` leaves the document out**, and prints only what the block named. For a caller that has the document on screen already.
- **A document with no block prints one line saying so.** Nothing is missing: that document carries its own context.

## Moving uncommitted work

**`util git work` copies the files you edited but never committed from one machine to another.** Walk away from the desktop mid-edit, and pick the same folder up on the laptop.

Committed work already travels through the remote. Edited files have no route, so switching machines either loses them or forces a junk commit.

Name each machine once, on each machine:

```bash
git config --global util.machine desktop
```

Every copy is filed under that name. Two machines answering to one name would overwrite each other on every send with nothing to report it, so `send` refuses until the name is set.

The routine is then two commands:

```bash
util git work send      # on the machine you are leaving
util git work get       # on the machine you are arriving at
```

`send` stores everything uncommitted and pushes it. `get`, on the other machine, fetches that copy and replays the edits into the folder, unstaged, the way you left them.

**A stored copy is a commit that no branch points at.** Git keeps its named pointers to commits under `refs/`, and a branch is one kind: `main` is really `refs/heads/main`. A copy goes to `refs/unfinished/<machine>/<branch>` instead, outside `refs/heads/`, which is the only place git acts on by itself. So a copy never shows up in `git branch`, nothing switches to it, and committing never moves it. Making one leaves your branch, your files and your staging area exactly as they were.

**A copy holds a set of edits, not a moment in time.** The branch does not have to be where it was, because the edits land on top of wherever it is now. Where a line changed on both sides, the file comes back carrying the ordinary `<<<<<<<` markers and VS Code opens its conflict editor on it. Settle each one, then `git add <file>`. Files that merged cleanly arrive staged and conflicted ones do not, so leave the staging area alone until every conflict is settled.

**`send --clear` empties the folder afterwards**, so a branch switch works. What it swept sits in git's stash, and `git stash pop` puts it back. Gitignored files stay where they are, because the stash does not sweep those.

**Gitignored files do not travel by default.** Name the ones that should in `.work-include` at the project root, one path per line:

```
.env.local
config/local-settings.json
```

**A path named there is pushed to whatever remote the project uses.** On a public repository that publishes it.

**Four things never arrive:**

- **An empty folder.** Git has no way to record one.
- **A folder holding its own `.git`.** Only a pointer travels, never the files inside. `send` names every such path as it runs, so the gap shows when the copy is made rather than when the files turn out to be missing.
- **A commit you made and never pushed.** A copy replays edits and nothing else, so push the branch as well.
- **The split between staged and unstaged.** Everything comes back unstaged.

**A bad restore is recoverable.** Before `get` overwrites anything, it stores whatever was in the folder at `refs/unfinished-backup/<branch>`. Pull a single file back out of that:

```bash
git show refs/unfinished-backup/main:src/parser.js > src/parser.js
```

A folder already matching the last commit gets no backup, having nothing to lose.

**`ls` and `drop` are the housekeeping.** `util git work ls` prints every stored copy: machine, branch, age, file count. `util git work drop` deletes this machine's copy of this branch, `drop laptop` a named machine's, and `drop --all` every copy of this branch. `get` never deletes the copy it used, and prints the drop command instead.

## Reading what Claude Code sends

**`util claude proxy` records what Claude Code puts in the context window.** It sits between the CLI and the Anthropic API, passes every request through untouched, and writes each one down as a Markdown document.

Each document opens with a table ranking what filled the context, largest first. The CLI behaves normally throughout, because the reply streams straight back.

Run it in one terminal, then point Claude Code at it from another:

```bash
util claude proxy
ANTHROPIC_BASE_URL=http://localhost:8787 claude
```

**The documents land in a `logs/` folder in the directory you ran the proxy from**, never beside the clone. Three environment variables move the parts: `PORT` for the port it listens on, `PROXY_LOGS` for where the documents go, and `UPSTREAM_URL` for an Anthropic-compatible endpoint other than `api.anthropic.com`.

**Two things distort the numbers**, and both matter before you cut anything on the strength of them.

- **Tool search goes off while you measure.** Claude Code normally withholds tool definitions and loads them when a task needs them. It stops doing that when `ANTHROPIC_BASE_URL` points anywhere other than Anthropic's own API, because most proxies drop the blocks on-demand loading depends on, so every definition loads up front instead. A session measured through the proxy therefore carries more context than the same session without it. `ENABLE_TOOL_SEARCH=true` turns it back on, and that works only through a proxy which forwards the request body unmodified. This one does: it copies the bytes through and reads them only to write the log.
- **Prompt caching starts cold.** Pointing the CLI at a new address begins a fresh cache, so the opening requests bill as full writes and usage climbs faster than usual until it settles.

**Not written here.** Matt Pocock published it as `agent-proxy`, at https://gist.github.com/mattpocock/5b3d76ea21f5f698aefded47a9cea3b1, and the configurable upstream came from r1cc4rd0m4zz4's fork of that gist, at https://gist.github.com/r1cc4rd0m4zz4/42c1a6a81874a5e59292d76192bfa1d2. This copy adds the header comment and writes its documents beside you rather than beside itself.
