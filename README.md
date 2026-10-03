# util

One command for all your small scripts: `util git save`, `util fs tree`, `util github clone`.

20 small scripts put 20 names on your `PATH`, and the short obvious ones, such as `tree` or `clone`, are already taken. `util` takes one name, and every script sits behind it. Adding a command is writing a file.

## Install

[Flow](https://github.com/Adrian333Dev/flow) installs util by itself. Without Flow, clone it anywhere and run the installer once by path:

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

[Commands](docs/commands.md) lists every command this repository ships.

## Add a command

Write an executable file at `<source>/<namespace>/<command>`, in any language, with a shebang line and its execute bit. It runs at once: `commands/git/save.sh` is `util git save`. A source is any folder registered with `util source add`, and a project's own `.util/` folder counts whenever you work inside the project.

[Adding commands](docs/adding-commands.md) covers sources, namespaces and their aliases, the line `util ls` prints, 2 sources claiming one name, and working on util itself.
