# util

One command holding all the small commands you write for yourself: `util git save`, `util fs tree`, `util github clone`.

A symlink builder, a repository cloner and an image optimiser share nothing but the person typing them, and each is useful on a machine with no project open. They also accumulate: 20 of them means 20 names on `PATH` competing with real binaries, and the short obvious ones (`tree`, `link`, `clone`, `merge`) are taken already. `util` spends one name and gives every command a qualifier instead.

`util` has no features of its own. It reads a list of directories off disk, gathers every executable it finds inside them, and runs the one you named. Adding a command is writing a file. This repository ships one of those directories, `commands/`, registered exactly like the ones you add, so a public repository, a private one and a single project can all contribute commands without knowing about each other.

## Table of contents

- [Typing a command](#typing-a-command)
- [Installing](#installing)
  - [Removing it](#removing-it)
- [Commands](#commands)
- [Adding a command](#adding-a-command)
  - [Sources](#sources)
  - [Writing the file](#writing-the-file)
  - [Namespaces](#namespaces)
  - [Descriptions](#descriptions)
  - [When two sources claim one name](#when-two-sources-claim-one-name)
- [Development](#development)

## Typing a command

```
util <namespace> <command> [args]
util <command> [args]              unique across namespaces, so it resolves alone
u ...                              second name on PATH, same program
```

**A word naming no namespace is looked up across all of them.** It resolves when exactly one command has that name, so `util tree` finds `fs tree`. The day a second `tree` exists anywhere, the short form stops guessing and prints both full names.

**A word matching nothing names the closest one that exists.** `util unistall` answers `did you mean "uninstall"?`, and `util source drpo <path>` answers the same way. The distance is single character edits, with two neighbours swapped counting as one, so `util gti save` finds `git`. A namespace and its alias count as one candidate. Anything equally close to two names suggests neither, because a wrong guess sends you looking in the wrong place. Every name `util` knows is covered: the built-in words, the namespaces, the aliases, and every command in every source, a project's own `.util/` included.

**Everything after the command name passes through untouched.** `util` dispatches to programs it did not write, so it never reads their flags. `util git save --help` is that command's own help, printed by that command.

Five words `util` answers itself, so no namespace can be called one of them:

```
util ls                    every command there is, grouped by source
util install               link both names, and register this repository
util uninstall             unlink both names, and drop this repository
util source add <path>     read commands from a directory
util help                  the shape, the conventions, and the listing
```

## Installing

**Clone it anywhere, then run the installer by path once**, because `util` is not a command until that run has made it one.

```bash
git clone https://github.com/Adrian333Dev/util.git ~/code/util
node ~/code/util/util.js install
```

`~/code/util` is an example: the installer links whatever clone it runs out of. It writes `util` and `u` into `~/.local/bin`, both pointing at `util.js`, and registers this repository's `commands/` as a source. Every later run is `util install`.

```
linked: ~/.local/bin/util
linked: ~/.local/bin/u
source added: ~/code/util/commands
```

**One line per thing that changed, then only the step you still have to take.** Those three lines are the whole output where `~/.local/bin` is on `PATH` already. Where it is not, neither name resolves yet, and the line that fixes it arrives with the name of the file `$SHELL` reads:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
```

**`install` never writes that file itself.** A shell config is yours, `uninstall` could not honestly take back a line it had appended, and which file to write is a guess for any shell but bash and zsh.

**A run finding every name already in place says `already` on each line**, so a finished install never reads as work being redone. Re-run it when the clone moves. Nothing is ever copied: an edit in the clone is live the moment you save it, and a new file in `commands/` needs no re-run at all.

- **A shell that was already open can miss the new link.** Bash remembers where it found a command, so a terminal that ran an older `util` keeps pointing at the old path. `hash -r` clears that, and a new terminal never has it.
- **`--bin <path>`** links somewhere other than `~/.local/bin`. `UTIL_BIN` sets the same directory from the environment, which is what the tests use.
- **A real file already holding one of the names refuses.** The message names the path, nothing is linked, and no source is registered. An existing symlink is replaced without asking, because pointing a name at a moved clone is the whole reason to re-run.

### Removing it

```bash
util uninstall
```

Both names off `PATH`, and this repository dropped from the registry. It takes `--bin <path>` on the same terms, and needs it whenever `install` was given one.

**Nothing else is touched.** A source you registered by hand stays registered, `~/.util` stays where it is, and the clone stays on disk: removing that is `rm -rf` on a directory, which needs no command of its own. A name `util` did not create is left alone and named in the output, whether it is a real file or a link into a second clone. Running it twice is safe, and so is running it on a machine where nothing was installed: both say so and exit 0.

## Commands

Every command this repository ships, with its flags and what it prints, is in [Commands](docs/commands.md). `util ls` prints the same list off the disk, and `--help` on any command prints that command's own header comment.

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

**A `description:` line inside a comment**, in the file's first 50 lines, in whatever comment syntax the language uses. `util ls` prints it beside the name, cut at the first full stop or 120 characters. Write a few words, then stop: a description is an index entry, never documentation, and a second sentence is never seen. The header comment explaining the command stays as long as it needs to be. A command missing a description still lists with the field blank, and the gap is the reminder.

**A markdown file can carry one too, and anything inside a code fence is ignored.** In markdown a `#` starts a heading, so an example `# description:` line sitting in a code block looks exactly like the real marker. Put the marker outside the fences.

### When two sources claim one name

**Two sources defining the same `namespace/command` refuse, and name both files.** Silent shadowing is the bug nobody finds: a command you edit that never runs, because another source got there first.

The refusal is scoped to that one command. Everything else in both sources keeps working, and `util ls` marks the clash with both paths, so the listing is where you go to see what happened.

A private command deliberately overriding a public one is a real want. That override is not supported yet.

## Development

```
util.js         the entry point: resolution and dispatch
lib/            sources, the catalog, the description and help readers, the listing
builtin/        the commands util answers itself: ls, install, uninstall, source
commands/       the public source: <namespace>/<command>
tests/          node --test, no dependencies
```

```bash
npm test
```

No dependencies and nothing to build. `node --test` is built into Node, and every test runs against a scratch `UTIL_HOME` rather than the registry on your machine.

**`--help` on a command shipped here prints that file's own header.** `lib/command.js` reads the comment at the top of the file, drops the shebang and the `description:` line, and prints the rest, so the help and the documentation are one text and cannot drift apart. One line wires it up:

```js
require('../../lib/command').helpOrRun(__filename, process.argv.slice(2));
```

**Nothing obliges a command to use it.** A command in another repository cannot reach `lib/` at all, and a shell script cannot require a Node module: `git save` reads its own header with awk instead. `util` still runs any executable in any language and still never reads its arguments.
