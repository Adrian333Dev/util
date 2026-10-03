# Installing

How `util install` puts util on your `PATH`, what it refuses, and what `util uninstall` leaves behind.

## Table of contents

- [Install](#install): one run by path, then `util install`
- [When something is in the way](#when-something-is-in-the-way): a missing `PATH` entry, an old shell, a real file
- [Remove it](#remove-it): `util uninstall`, and what it leaves alone

## Install

**Clone it anywhere, then run the installer by path once**, because `util` is not a command until that run has made it one.

```console
$ git clone https://github.com/Adrian333Dev/util.git ~/code/util
$ node ~/code/util/util.js install
```

`~/code/util` is an example: the installer links whatever clone it runs out of. It writes `util` and `u` into `~/.local/bin`, both pointing at `util.js`, and registers this repository's `commands/` as a source. Every later run is `util install`.

```text
linked: ~/.local/bin/util
linked: ~/.local/bin/u
source added: ~/code/util/commands
```

**One line per thing that changed, then only the step you still have to take.** A run finding every name already in place says `already` on each line. Re-run it when the clone moves. Nothing is ever copied: an edit in the clone is live the moment you save it, and a new file in `commands/` needs no re-run at all.

**`--bin <path>`** links somewhere other than `~/.local/bin`. `UTIL_BIN` sets the same directory from the environment, which is what the tests use.

## When something is in the way

- **`~/.local/bin` is not on `PATH`.** Neither name works yet, and the line that fixes it arrives naming the file your shell reads at startup:

  ```sh
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  ```

  `install` never writes that file itself. Your shell config is yours. `uninstall` could not safely take a line back out of it later, and for any shell other than bash and zsh, which file to write is a guess.
- **A shell that was already open can miss the new link.** Bash remembers where it found a command, so a terminal that ran an older `util` keeps pointing at the old path. `hash -r` clears that, and a new terminal never has it.
- **A real file already holding one of the names refuses.** The message names the path, nothing is linked, and no source is registered. An existing symlink is replaced without asking, because pointing a name at a moved clone is the whole reason to re-run.

## Remove it

```console
$ util uninstall
```

Both names off `PATH`, and this repository dropped from the registry. It takes `--bin <path>` on the same terms, and needs it whenever `install` was given one.

**Nothing else is touched.** A source you registered by hand stays registered, `~/.util` stays where it is, and the clone stays on disk: removing that is `rm -rf` on a directory, which needs no command of its own. A name `util` did not create is left alone and named in the output, whether it is a real file or a link into a second clone. Running it twice is safe, and so is running it on a machine where nothing was installed: both say so and exit 0.
