# Adding commands

How util finds a command by name, where commands come from, and how to write one.

## Table of contents

- [How a name is found](#how-a-name-is-found): the short form, typo suggestions, and arguments passed through
- [Sources](#sources): the folders `util` reads commands from
- [Writing the file](#writing-the-file): any language, named for the command
- [Namespaces](#namespaces): the folder a command sits in, and its alias
- [Summaries](#summaries): the line `util ls` prints for each command
- [When 2 sources claim one name](#when-2-sources-claim-one-name): both refuse, and name both files
- [Working on util itself](#working-on-util-itself): the layout and the tests

## How a name is found

**A word naming no namespace is looked up across all of them.** It runs when exactly one command has that name, so `util tree` finds `fs tree`. The day a second `tree` exists anywhere, the short form stops guessing and prints both full names.

**A word matching nothing suggests the closest name that does exist.** `util unistall` answers `did you mean "uninstall"?`, and `util source drpo <path>` answers the same way. Closest means one typo away: a character added, dropped or changed, or 2 neighbours swapped, so `util gti save` finds `git`. A namespace and its alias count as one candidate. A word equally close to 2 names suggests neither, because a wrong guess sends you looking in the wrong place. Every name `util` knows is covered: the built-in words, the namespaces, the aliases, and every command in every source, a project's own `.util/` included.

**Everything after the command name passes through untouched.** `util` dispatches to programs it did not write, so it never reads their flags. `util git save --help` is that command's own help, printed by that command.

The 5 words `util` answers itself, `ls`, `install`, `uninstall`, `source` and `help`, can never name a namespace.

## Sources

**A source is a directory laid out `<namespace>/<command>`.** Register it once and it contributes everything it holds from then on, so adding a command later is writing a file rather than running anything.

```console
$ util source add ~/code/util/commands
$ util source ls
$ util source drop ~/code/util/commands
```

The registry is `~/.util/sources`: one path per line, `#` for a comment, `~` allowed. Editing it by hand is as supported as the 3 commands above. `UTIL_HOME` moves the whole folder, which is what the tests do.

3 kinds of source, and the directory decides the kind:

- **Public**: this repository's own `commands/`, registered when you install
- **Private**: a second repository, registered by hand, never published
- **A project's own**: `<project-root>/.util/`, picked up whenever your working directory is inside that project, and never written to the registry

**Nothing inside a command says which kind it is.** The directory holding it decides, so publishing one is moving the file: `mv <project>/.util/git/foo <util>/commands/git/foo`, and nothing else.

## Writing the file

Write an executable at `<source>/<namespace>/<command>` and it exists.

```sh
#!/usr/bin/env bash
# util fs link: build a symlink, refusing to replace a real file.
...
```

- **Any language.** `util` runs the file and hands it every argument. It needs a shebang line and its execute bit, and `util ls` tells you when the bit is missing.
- **The filename is the command name with any extension dropped.** `git/save.sh` is `util git save`, so a script keeps the extension that says what runs it and the command stays a word.
- **The terminal passes through.** A command that prompts, pages or prints colour behaves exactly as it does when you run it by path.
- **A command exits with its own status**, and `util` exits with the same one.

## Namespaces

A namespace is a folder in a source. It appears when the second command needs it. `git` has one while holding a single command, because `util save` never says save what. A namespace wrapped around one command whose name already explains itself only adds a word to type.

**A namespace can take a short alias from a `.alias` file** holding the one word, such as `g` in `git/.alias`. The alias gives the namespace a second name (`util g save`), for when a command name is no longer unique and typing the namespace every time is a chore. `git` and `github` carry one, and `fs` needs none.

**Namespaces merge across sources.** 2 sources both holding a `git/` folder contribute to one `git` namespace. The first source holding it names it, and a second source adding commands inherits the alias.

## Summaries

**`util ls` prints the first sentence of each command's header comment**, cut at 120 characters. A leading `util <namespace> <command>:` is dropped, so `# util git save: stage everything, commit it and push.` lists as `stage everything, commit it and push`. A command with no header comment still lists, with the field left blank.

## When 2 sources claim one name

**2 sources defining the same `namespace/command` both refuse to run, and name both files.** The alternative is the bug nobody finds: a command you keep editing that never runs, because another source claimed that name first.

Only that one command refuses. Everything else in both sources keeps working, and `util ls` marks the clash with both paths, so the listing is where you go to see what happened.

Deliberately overriding a public command with a private one is a fair thing to want. It is not supported yet.

## Working on util itself

```text
util.js         the entry point: resolution and dispatch
lib/            sources, the catalog, the help reader, the listing
builtin/        the commands util answers itself: ls, install, uninstall, source
commands/       the public source: <namespace>/<command>
tests/          node --test, no dependencies
```

```console
$ npm test
```

No dependencies and nothing to build. `node --test` is built into Node, and every test runs against a scratch `UTIL_HOME` rather than the registry on your machine.

**`--help` on a command shipped here prints that file's own header.** `lib/command.js` reads the comment at the top of the file, drops the shebang, and prints the rest, so the help and the documentation are one text and cannot drift apart. One line wires it up:

```js
require('../../lib/command').helpOrRun(__filename, process.argv.slice(2));
```

**Nothing obliges a command to use it.** A command in another repository cannot reach `lib/` at all, and a shell script cannot require a Node module: `git save` reads its own header with awk instead. `util` still runs any executable in any language and still never reads its arguments.
