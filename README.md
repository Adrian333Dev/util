# util

One command holding all the small commands you write for yourself: `util git save`, `util fs tree`, `util github clone`.

`util` has no features of its own. It reads a list of directories off disk, gathers every executable it finds inside them, and runs the one you named. Adding a command is writing a file. This repository ships one of those directories, `commands/`, registered exactly like the ones you add, so a public repository, a private one and a single project can all contribute commands without knowing about each other.

## Table of contents

- [What `util` is for](#what-util-is-for)
- [Typing a command](#typing-a-command)
- [Installing](#installing)
- [Commands](#commands)
  - [The `open` block](#the-open-block)
  - [Moving uncommitted work](#moving-uncommitted-work)
  - [Reading what Claude Code sends](#reading-what-claude-code-sends)
- [Adding a command](#adding-a-command)
  - [Sources](#sources)
  - [Writing the file](#writing-the-file)
  - [Namespaces](#namespaces)
  - [Descriptions](#descriptions)
  - [When two sources claim one name](#when-two-sources-claim-one-name)
- [Development](#development)

## What `util` is for

A symlink builder, a repository cloner and an image optimiser share nothing but the person typing them. Each is useful on a machine with no project open, no ticket and no workflow. They also accumulate: 20 of them means 20 names on `PATH` competing with real binaries, and the short obvious ones (`tree`, `link`, `clone`, `merge`) are taken or ambiguous.

`util` takes one of those names and gives every command a qualifier instead: `util git save`, `util fs merge`, `util github clone`.

## Typing a command

```
util <namespace> <command> [args]
util <command> [args]              unique across namespaces, so it resolves alone
u ...                              second name on PATH, same program
```

**A word naming no namespace is looked up across all of them.** It resolves when exactly one command has that name, so `util tree` finds `fs tree`. The day a second `tree` exists anywhere, the short form stops guessing and prints both full names.

**Everything after the command name passes through untouched.** `util` dispatches to programs it did not write, so it never reads their flags. `util git save --help` is that command's own help, printed by that command.

Four words `util` answers itself, so no namespace can be called one of them:

```
util ls                    every command there is, grouped by source
util install               link both names, and register this repository
util source add <path>     read commands from a directory
util help                  the shape, the conventions, and the listing
```

## Installing

```bash
node <clone>/util.js install
```

**Run it by path once**, because `util` is not a command until that run has made it one. It links `util` and `u` in `~/.local/bin`, both pointing at `util.js`, and it registers this repository's `commands/` as a source. Every later run is `util install`.

Nothing is copied. An edit in the clone is live the moment you save it, and a command added to `commands/` needs no re-run at all. Re-run it when the clone moves.

- **`--bin <path>`** links somewhere other than `~/.local/bin`. `UTIL_BIN` sets the same directory from the environment, which is what the tests use.
- **A real file already holding one of the names refuses.** The message names the path, nothing is linked, and no source is registered. An existing symlink is replaced without asking, because pointing a name at a moved clone is the whole reason to re-run.

`~/.local/bin` has to be on your `PATH`.

## Commands

What this repository ships. `util ls` prints the same list off the disk, and `--help` on any of them prints that command's own header comment.

**`claude`**

- **`proxy`**: log what Claude Code actually sends the model.

**`fs`**

- **`tree <path>`**: a directory tree with the noise stripped out, each entry carrying its own `description:` line.
- **`merge <path>...`**: many files as one stream, each in a fenced block under its path. `src/parser.js:40-120` takes a line range, `--ext` and `--except` filter, `--force` passes the 2000-line limit.
- **`open <file>`**: one document and every file it names, as one stream.
- **`link <target> <name>`**: build a symlink, refusing to replace a real file.

**`git`**, aliased `g`

- **`save`**: add, commit and push in one step.
- **`work`**: carry uncommitted work between two machines.

**`github`**, aliased `gh`

- **`clone <repo>...`**: clone one or more repositories from any URL form.
- **`bookmark <repo>`**: append a repository's stars, language and pushed date to a file.

Three of them do something a one-line description cannot cover.

### The `open` block

**A block you write inside a document, holding the paths of other files.** One command prints that document, and turns the list of paths into the full contents of the files.

Write the block anywhere in the document, one path per line. Here it sits inside `docs/notes.md`:

````
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

Handoffs, specs, design notes and tickets are what this is for. Somebody arrives at one cold and opens four other files before it means anything. The block is those four files, named by whoever already knew which they were.

- **One path per line.** A `#` note beside it is stripped, and so is a blank line.
- **A line range works**: `src/parser.js:2-4` gives lines 2 to 4.
- **A path resolves beside the document first, then from the working directory.** A document names its neighbours by bare filename.
- **A named file that no longer exists prints as missing**, and every other file still prints.
- **Nothing is truncated.** Somebody wrote the list by hand, so its length is a decision already made.
- **`--files-only` leaves the document out**, and prints only what the block named. For a caller that has the document on screen already, which is what Flow's `flow get --files` has by the time it runs this.
- **A document with no block prints one line saying so.** Nothing is missing: that document carries its own context.

### Moving uncommitted work

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

### Reading what Claude Code sends

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

## Adding a command

### Sources

**A source is a directory laid out `<namespace>/<command>`.** Register it once and it contributes everything it holds from then on, so adding a command later is writing a file rather than running anything.

```bash
util source add ~/code/util/commands
util source ls
util source drop ~/code/util/commands
```

The registry is `~/.util/sources`: one path per line, `#` for a comment, `~` allowed. Editing it by hand is as supported as the three commands above. `UTIL_HOME` moves the whole folder, which is what the tests do.

Three kinds of source, and the directory decides the kind:

- **Public**: this repository's own `commands/`, registered when you install
- **Private**: a second repository, registered by hand, never published
- **A project's own**: `<project-root>/.util/`, picked up whenever your working directory is inside that project, and never written to the registry

**Nothing inside a command says which kind it is.** The directory holding it decides, so publishing one is moving the file: `mv <project>/.util/git/foo <util>/commands/git/foo`, and nothing else.

### Writing the file

Write an executable at `<source>/<namespace>/<command>` and it exists.

```bash
#!/usr/bin/env bash
# description: build a symlink, refusing to replace a real file
...
```

- **Any language.** `util` runs the file and hands it every argument. It needs a shebang line and its execute bit, and `util ls` tells you when the bit is missing.
- **The filename is the command name with any extension dropped.** `git/save.sh` is `util git save`, so a script keeps the extension that says what runs it and the command stays a word.
- **The terminal passes through.** A command that prompts, pages or prints colour behaves exactly as it does when you run it by path.
- **A command exits with its own status**, and `util` exits with the same one.

**`--help` prints the file's own header**, for the commands shipped here. `lib/command.js` reads the comment at the top of the file, drops the shebang and the `description:` line, and prints the rest, so the help and the documentation are the same text and cannot drift apart. One line wires it up:

```js
require('../../lib/command').helpOrRun(__filename, process.argv.slice(2));
```

**Nothing obliges a command to use it.** A command in another repository cannot reach `lib/` at all, and a shell script cannot require a Node module: `git save` reads its own header with awk instead. `util` still runs any executable in any language and still never reads its arguments.

### Namespaces

A namespace is a folder in a source. It appears when the second command needs it: `git` earns one with a single member, because *save what* has no answer without it, while a namespace holding one self-explanatory command is noise.

**A namespace declares itself in a `.info` file**: a description, a short alias, or both. Every namespace here carries the alias alone:

```
alias: g
```

The description is the first paragraph. An `alias:` line anywhere is stripped out before that paragraph is read, so the two sit in either order. An alias gives the namespace a second name (`util g save`), for a name gone ambiguous that still wants to be brief.

**Most namespaces need no description, and one here needs no `.info` at all.** `fs` has none: the name says what it holds, and a description repeating a name is worse than none. `git` and `github` keep theirs only because an alias needs somewhere to live.

**Namespaces merge across sources.** Two sources both holding a `git/` folder contribute to one `git` namespace. The first source carrying a `.info` names it, and a second source adding commands inherits the description and the alias rather than competing for them.

### Descriptions

**A `description:` line inside a comment**, in the file's first 50 lines, in whatever comment syntax the language uses. `util ls` prints it beside the name.

**Write a few words, then stop.** A description is an index entry, never the file's documentation. The header comment explaining what a command does stays as long as it needs to be; this is the one line that fits in a list. `util ls` cuts it at the first full stop or 120 characters, whichever comes first, so a second sentence is written and never seen.

**A markdown file can carry one too, and anything inside a code fence is ignored.** In markdown a `#` starts a heading, so an example `# description:` line sitting in a code block looks exactly like the real marker. Put the marker outside the fences.

**A command missing one still lists, with the field blank.** The gap is the reminder.

### When two sources claim one name

**Two sources defining the same `namespace/command` refuse, and name both files.** Silent shadowing is the bug nobody finds: a command you edit that never runs, because another source got there first.

The refusal is scoped to that one command. Everything else in both sources keeps working, and `util ls` marks the clash with both paths, so the listing is where you go to see what happened.

A private command deliberately overriding a public one is a real want. That override is not supported yet.

## Development

```
util.js         the entry point: resolution and dispatch
lib/            sources, the catalog, the description and help readers, the listing
builtin/        the commands util answers itself: ls, install, and source
commands/       the public source: <namespace>/<command>
tests/          node --test, no dependencies
```

```bash
npm test
```

No dependencies and nothing to build. `node --test` is built into Node, and every test runs against a scratch `UTIL_HOME` rather than the registry on your machine.
