# util

One command for all your small scripts: `util git save`, `util fs tree`, `util repos clone`.

20 small scripts put 20 names on your `PATH`, and the short obvious ones, such as `tree` or `clone`, are already taken. `util` takes one name, and every script sits behind it. Adding a command is writing a file.

## Contents

- [Install](#install)
- [Use](#use)
- [Commands](#commands): one table per namespace, each command with an example
- [Saving](#saving): `git save`, with worktrees and nested repos
- [Nested repos](#nested-repos): `.repos`, and getting every repo back on a new machine
- [The `open` block](#the-open-block)
- [Moving uncommitted work](#moving-uncommitted-work)
- [Reading what Claude Code sends](#reading-what-claude-code-sends)
- [Add a command](#add-a-command)

## Install

Clone it anywhere and run the installer once by path:

```console
$ git clone https://github.com/Adrian333Dev/util.git ~/code/util
$ node ~/code/util/util.js install
```

```text
linked: ~/.local/bin/util
linked: ~/.local/bin/u
source added: ~/code/util/commands
```

Where `~/.local/bin` is not on your `PATH`, it prints the line to add to your shell's startup file. Nothing is copied, so an edit in the clone is live the moment you save it. `util uninstall` takes both names off again. [Installing](docs/installing.md) covers the rest.

## Use

```text
util <namespace> <command> [args]
util <command> [args]              when only one command has that name
u ...                              the same program, shorter
```

A mistyped name gets the closest real one: `util unistall` answers `did you mean "uninstall"?`. Everything after the command name goes to the command untouched, so `--help` prints the command's own help.

5 words util answers itself:

```text
util ls                    every command there is, grouped by source
util install               link both names, and register this repository
util uninstall             unlink both names, and drop this repository
util source add <path>     read commands from a directory
util help                  how util works, and every command there is
```

## Commands

`util ls` prints this list off the disk. `--help` on any command prints its own header: every way to call it, and what it refuses. Every command refuses a flag it cannot use rather than run on with that flag ignored.

### `fs`: files and folders

| Command | What it does | Example |
|---|---|---|
| `tree [path]` | Print a folder, one line per folder with its files and their line counts. Hides `node_modules`, `.git` and other build folders. `--depth`, `--except`, `--draw` for a drawn tree, `--into <file>` writes it into a document between `<!-- tree -->` and `<!-- /tree -->` | `util fs tree src --depth 2` |
| `merge <path>...` | Print many files as one text, each in a code block labelled with its path, every line numbered, for pasting into a chat. `file:40-120` takes a range, `--ext` and `--except` filter, `--force` prints past the 2000-line limit | `util fs merge src README.md --ext ts` |
| `open <file>` | Print a document, then every file its `open` block lists ([below](#the-open-block)) | `util fs open docs/notes.md` |
| `link <source> <target>` | Make a symlink with full paths, refusing to replace a real file without `--force` | `util fs link scripts/x.sh ~/.local/bin/x` |

### `git` (alias `g`): saving and moving work

| Command | What it does | Example |
|---|---|---|
| `save [message]` | Stage everything, commit and push. With no message, the message names what changed and counts the lines. `-a` saves every nested repo of yours first, `-w` merges a worktree ([Saving](#saving)) | `util git save "fix the parser"` |
| `repos` | List the git repos nested inside this one: path, yours or others', clean, changed or missing, URL. `util repos` is short for `util git repos`, in every form below | `util repos` |
| `repos clone <repo>...` | Clone from GitHub, named by `owner/repo`, URL, `git@` remote or a link into one, and record each in the `.repos` of the repo holding it ([Nested repos](#nested-repos)). `--into <dir>` clones elsewhere | `util repos clone owner/repo --into repos` |
| `repos add <path>...` | Record a repo moved in or cloned by hand in `.repos` | `util repos add tools/scraper` |
| `repos drop <path>...` | Take a repo out of `.repos` | `util repos drop tools/scraper` |
| `repos restore` | Clone every repo `.repos` lists that is missing, then the same inside each | `util repos restore` |
| `uncommitted send` / `get` | Move the changes you have not committed to another machine ([below](#moving-uncommitted-work)) | `util git uncommitted send` |

### `github` (alias `gh`): repositories on GitHub

| Command | What it does | Example |
|---|---|---|
| `bookmark <repo>...` | Save a repository as one list line (stars, language, last push, description), added to `--to <file>`. One already in the file is skipped | `util github bookmark owner/repo --to links.md` |

### `claude`: Claude Code

| Command | What it does | Example |
|---|---|---|
| `proxy` | Record every request Claude Code sends to the model ([below](#reading-what-claude-code-sends)) | `util claude proxy` |

## Saving

`util git save` adds, commits and pushes in one step. `-p src,docs` stages only those paths, `-n` commits without pushing, `--dry-run` prints the commands and runs none.

- **`save -a [message]`** first saves every nested repo of yours (its origin has this repo's owner) with changes or unpushed commits, deepest first, then this one. Others' clones are never committed in. A plain `save` stays in one repo.
- **`save -w [name]`** merges a git worktree: it commits the worktree (the message is its branch name), replays it on top of the branch the main checkout has out, moves that branch up to it and pushes that branch. With no name it merges the worktree you are inside, or from the main checkout lists the worktrees and changes nothing. A plain `save` never merges anything. It stops, with nothing further changed, on a conflict (the replay is undone), on uncommitted edits in the main checkout to a file the merge changes, on a failing check (`git config util.saveCheck "<command>"`, run in the worktree), and, with no check set, when the main branch had moved on and the replayed code is untested (`--no-check` goes ahead). The worktree folder stays.
- A save never writes `.repos`.

## Nested repos

A repo can hold others: a workspace holding its projects, a project holding clones it studies. Git keeps none of them, so a fresh clone of the outer repo comes back without them. `.repos` remembers them.

- `.repos`, at the root of the repo holding them, has one `<path> <url>` line per nested repo, sorted. Commit it like any file. Only `repos clone`, `repos add` and `repos drop` write it.
- `util repos` marks a repo on disk that `.repos` doesn't list `(not in .repos)`, one listed but not on disk `missing`, and a listed URL that differs from the repo's origin.
- Only the nearest repos count: a repo inside a nested repo is in that repo's own `.repos`. Folders named `node_modules`, `.venv`, `tmp`, `temp` and `downloads` are skipped. A repo with no origin can't be added, since nothing could restore it.
- On a new machine: clone the outer repo, then `util repos restore` in it.

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

````
open: docs/notes.md and 2 files, 23 lines

``` docs/notes.md
 1	# Splitting the parser
 2
 3	The tokenizer and the builder are one file. Pull the builder out.
 4
 5	```open
 6	plan.md
 7	src/parser.js:2-4   # the middle bit
 8	```
 9
10	Next session: start at step 2.
```

``` docs/plan.md
1	step 1: read the tokenizer
2	step 2: split the builder out
```

``` src/parser.js:2-4
2	b
3	c
4	d
```
````

One command in place of three reads. **`docs/notes.md` is never modified.** It is copied into the output, whole, ahead of everything its block named.

Three things that output shows:

- **The label on a block is the path**, relative to the directory the command ran in. `plan.md` in the block resolved to `docs/plan.md`, beside the document.
- **Every line carries its number in the file.** A range counts from where it starts, so `src/parser.js:2-4` opens on line 2. A fence inside a file sits behind its number, so it never closes the block early.
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

**`util git uncommitted` copies the files you edited but never committed from one machine to another.** Walk away from the desktop mid-edit, and pick the same folder up on the laptop.

Committed work already travels through the remote. Edited files have no route, so switching machines either loses them or forces a junk commit.

Name each machine once, on each machine:

```bash
git config --global util.machine desktop
```

A machine with Flow on it is named already: `flow install` sets `flow.machine`, and util reads that where `util.machine` is missing.

Every copy is filed under that name. Two machines answering to one name would overwrite each other on every send with nothing to report it, so `send` refuses until the name is set.

The routine is then two commands:

```bash
util git uncommitted send      # on the machine you are leaving
util git uncommitted get       # on the machine you are arriving at
```

`send` stores everything uncommitted and pushes it. `get`, on the other machine, fetches that copy and replays the edits into the folder, unstaged, the way you left them.

**A stored copy is a commit that no branch points at.** Git keeps its named pointers to commits under `refs/`, and a branch is one kind: `main` is really `refs/heads/main`. A copy goes to `refs/unfinished/<machine>/<branch>` instead, outside `refs/heads/`, which is the only place git acts on by itself. So a copy never shows up in `git branch`, nothing switches to it, and committing never moves it. Making one leaves your branch, your files and your staging area exactly as they were.

**A copy holds a set of edits, not a moment in time.** The branch does not have to be where it was, because the edits land on top of wherever it is now. Where a line changed on both sides, the file comes back carrying the ordinary `<<<<<<<` markers and VS Code opens its conflict editor on it. Settle each one, then `git add <file>`. Files that merged cleanly arrive staged and conflicted ones do not, so leave the staging area alone until every conflict is settled.

**`send --clear` empties the folder afterwards**, so a branch switch works. What it swept sits in git's stash, and `git stash pop` puts it back. Gitignored files stay where they are, because the stash does not sweep those.

**Gitignored files do not travel by default.** Name the ones that should in `.uncommitted-include` at the project root, one path per line:

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

**`ls` and `drop` are the housekeeping.** `util git uncommitted ls` prints every stored copy: machine, branch, age, file count. `util git uncommitted drop` deletes this machine's copy of this branch, `drop laptop` a named machine's, and `drop --all` every copy of this branch. `get` never deletes the copy it used, and prints the drop command instead.

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

## Add a command

Write an executable file at `<source>/<namespace>/<command>`, in any language, with a shebang line and its execute bit. It runs at once: `commands/git/save.sh` is `util git save`. A source is any folder registered with `util source add`, and a project's own `.util/` folder counts whenever you work inside the project.

[Adding commands](docs/adding-commands.md) covers sources, namespaces and their aliases, the line `util ls` prints, 2 sources claiming one name, and working on util itself.
