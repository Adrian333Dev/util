# util

A dispatcher for the general-purpose commands you type: `util git save`, `util fs tree`, `util github clone`.

It ships no commands of its own. It reads a list of directories, builds one namespace out of everything it finds, and runs the file you named. That is what lets a public repository, a private one and a single project all contribute commands without any of them knowing about the others.

- [What `util` is for](#what-util-is-for) — why these commands are not one program
- [The shape](#the-shape) — how a command is typed
- [Sources](#sources) — where commands are read from
- [Writing a command](#writing-a-command) — a file, in any language
- [Namespaces](#namespaces) — the qualifier, and its short alias
- [Descriptions](#descriptions) — the one line printed beside a name
- [Two sources, one name](#two-sources-one-name) — what happens, and why
- [Installing](#installing) — not built yet
- [Development](#development) — the layout and the tests

## What `util` is for

A symlink builder, a repository cloner and an image optimiser share nothing but the person typing them. Each is useful on a machine with no project open, no ticket, and no workflow. They are also the commands that collect: 20 of them means 20 names on `PATH`, competing with real binaries — and the short obvious ones, `tree`, `link`, `clone`, `merge`, are all taken or ambiguous already.

`util` gives them one name to enter through and a qualifier each. `gsave` meant *git save* and `fmerge` meant *file merge*; the old prefixes carried the qualifier as a letter, and the namespace spells it out instead.

**Some of these commands are private and some are public.** A source is a whole directory, and which repository it sits in is what makes it one or the other. Nothing inside a command is marked.

## The shape

```
util <namespace> <command> [args]
util <command> [args]              unique across namespaces, so it resolves alone
u ...                              second name on PATH, same program
```

**A word naming no namespace is looked up across all of them.** It resolves when exactly one command has that name, so `util tree` finds `fs tree`. The day a second `tree` exists anywhere, the short form stops guessing and prints both full names. Brevity is free until the ambiguity is real, and you are told the moment it is.

**Everything after the command name passes through untouched.** `util` never parses a command's flags, because it dispatches to programs it did not write. `util git save --help` is that command's own help, printed by that command.

Three things `util` answers itself, so no namespace can be called one of them:

```
util ls                    every command there is, grouped by source
util source add <path>     read commands from a directory
util help                  the shape, the conventions, and the listing
```

## Sources

**A source is a directory laid out `<namespace>/<command>`.** Register it once and it contributes everything it holds from then on, so adding a command later is writing a file rather than running anything.

```
util source add ~/code/util/commands
util source ls
util source drop ~/code/util/commands
```

The registry is `~/.util/sources` — one path per line, `#` for a comment, `~` allowed. Editing it by hand is as supported as the three commands above. Set `UTIL_HOME` to move the whole folder, which is what the tests do.

Three kinds of source, and the directory decides the kind:

- **Public** — this repository's own `commands/`, registered when you install
- **Private** — a second repository, registered by hand, never published
- **A project's own** — `<project-root>/.util/`, picked up whenever your working directory is inside that project, and never written to the registry

**Promotion is a move.** A command that started in one project and turns out to be general is `mv <project>/.util/git/foo <util>/commands/git/foo`, and nothing else.

## Writing a command

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

## Namespaces

A namespace is a folder in a source. It appears when the second command needs it: `git` earns one with a single member, because *save what* has no answer without it, while a namespace holding one self-explanatory command is noise.

**A namespace describes itself in a `.info` file**, which also declares its short alias:

```
git, wrapped.

alias: g
```

The first paragraph is the description. An `alias:` line anywhere gives a second name the namespace answers to — `util g save` — and never counts as part of the description. An alias is for a name that has gone ambiguous and still wants to be brief.

**Namespaces merge across sources.** Two sources both holding a `git/` folder contribute to one `git` namespace. The first source to carry a `.info` names it, and a second source adding commands inherits the description and the alias rather than competing for them.

## Descriptions

**A `description:` line inside a comment**, in the file's first 50 lines, in whatever comment syntax the language uses. `util ls` prints it beside the name.

A description is an index entry, never the file's documentation. The header comment explaining what a command does stays as long as it needs to be; this is the one line that fits in a list. It runs to the end of its sentence or 120 characters, whichever comes first.

**A command missing one still lists, with the field blank.** The gap is the reminder.

## Two sources, one name

**Two sources defining the same `namespace/command` refuse, and name both files.** Silent shadowing is the bug nobody finds: a command you edit that never runs, because another source got there first.

The refusal is scoped to that one command. Everything else in both sources keeps working, and `util ls` marks the clash with both paths, so the listing is where you go to see what happened.

A private command deliberately overriding a public one is a real want. It gets an explicit marker the first time somebody needs it, and not before.

## Installing

**Not built.** `util install` will own the `PATH` links — `util` and `u` — and register this repository's `commands/` as the first source. Until then:

```bash
ln -sfn "$PWD/util.js" ~/.local/bin/util
ln -sfn "$PWD/util.js" ~/.local/bin/u
util source add "$PWD/commands"
```

`~/.local/bin` has to be on your `PATH`.

## Development

```
util.js         the entry point: resolution and dispatch
lib/            sources, the catalog, the description reader, the listing
builtin/        the commands util answers itself — ls and source
commands/       the public source: <namespace>/<command>
tests/          node --test, no dependencies
```

```bash
npm test
```

No dependencies and nothing to build. `node --test` is built into Node, and every test runs against a scratch `UTIL_HOME` rather than the registry on your machine.

**One rule from `flow` does not transfer.** `flow` declares every flag each command accepts and refuses an undeclared one. `util` cannot: it dispatches to programs it did not write, so each command validates its own arguments and `util` passes them through.
