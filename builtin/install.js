'use strict';
/**
 * `util install`: the two names on PATH, and this repository as a source.
 *
 * Run it once by path on a fresh machine, because `util` is not a command
 * until this has made it one:
 *
 *   node <clone>/util.js install
 *
 * Everything after that is `util install`, and re-running it is how a moved
 * clone reaches this machine again. Nothing is ever copied: both names are
 * symlinks to one file, so an edit in the clone is live as soon as it is
 * saved, and a command added to `commands/` needs no re-run at all.
 *
 * The link directory is `~/.local/bin`. `--bin <path>` moves it, and `UTIL_BIN`
 * moves it from the environment, which is what the tests set, beside
 * `UTIL_HOME`, so a test that names no directory still cannot put symlinks on
 * the machine running the suite.
 *
 * `util uninstall` takes it all back, and takes the same flag.
 */

const fs = require('fs');
const path = require('path');
const { binDir } = require('../lib/args');
const { UtilError } = require('../lib/error');
const sources = require('../lib/sources');

/** One file, two names. `u` is there because `util` is typed all day. */
const NAMES = ['util', 'u'];

/**
 * The clone this file came out of.
 *
 * `__dirname` is the real path of the module, symlinks resolved, so a re-run
 * typed as `util` finds the clone the link points into rather than the
 * directory holding the link.
 */
const cloneRoot = () => path.resolve(__dirname, '..');

/**
 * A name already taken by a real file is somebody else's.
 *
 * `~/.local/bin` is a shared directory, and a wrong path here would destroy a
 * program `util` never installed. A symlink is replaced without asking, since
 * pointing one at a new clone is the whole reason to re-run.
 */
function refuseReal(to) {
  let existing;
  try {
    existing = fs.lstatSync(to);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return;
  }
  if (!existing.isSymbolicLink()) {
    throw new UtilError(
      `${to} is a real file, not a link, so util will not replace it.\n` +
      '  Move it aside, or pass --bin <path> to link somewhere else.'
    );
  }
}

/**
 * Is this name already the link `install` would write?
 *
 * `readlink` rather than `realpath`, matching `uninstall`: a link into a clone
 * somebody has deleted is one to replace, and `realpath` throws on it.
 */
function pointsHere(to, entry) {
  let existing;
  try {
    existing = fs.lstatSync(to);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return false;
  }
  if (!existing.isSymbolicLink()) return false;
  return path.resolve(path.dirname(to), fs.readlinkSync(to)) === entry;
}

/** Is the link directory one the shell actually searches? */
function onPath(dir) {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .some((entry) => sources.expand(entry) === dir);
}

/** The directory written the way a shell config writes it, so the line pastes. */
function forShell(dir) {
  const short = sources.shorten(dir);
  return short.startsWith('~/') ? `$HOME/${short.slice(2)}` : dir;
}

/**
 * The file that shell reads at startup, or null.
 *
 * Named from `$SHELL`, and only for the two this can be sure of. Appending to
 * the wrong file leaves you with a line that never runs and no idea why, so
 * where the shell is unknown the message says what to do instead of where.
 */
function startupFile() {
  const shell = path.basename(process.env.SHELL || '');
  if (shell === 'zsh') return '~/.zshrc';
  if (shell === 'bash') return '~/.bashrc';
  return null;
}

module.exports = {
  // Read by `uninstall`, so the two names are written down once.
  NAMES,
  summary: 'put util on PATH, and register this repository as a source',
  run({ positional, usage, out }) {
    const bin = binDir(positional, usage);
    const clone = cloneRoot();
    const entry = path.join(clone, 'util.js');
    const targets = NAMES.map((name) => path.join(bin, name));
    const done = [];

    // Every name is checked before any of them is written, so a refusal leaves
    // the machine exactly as it was rather than half installed.
    targets.forEach(refuseReal);

    // Each line says what happened to that name, so a re-run of a finished
    // install reads as three "already" lines rather than as work being redone.
    fs.mkdirSync(bin, { recursive: true });
    for (const to of targets) {
      const shown = path.join(sources.shorten(bin), path.basename(to));
      if (pointsHere(to, entry)) {
        done.push(`already linked: ${shown}`);
        continue;
      }
      fs.rmSync(to, { force: true });
      fs.symlinkSync(entry, to);
      done.push(`linked: ${shown}`);
    }

    // Registered like any other source, on the same terms. Nothing about this
    // repository's `commands/` is built in, which is what lets a private
    // repository and a project contribute to the same namespaces.
    const { path: added, added: isNew } = sources.add(path.join(clone, 'commands'));
    done.push(`${isNew ? 'source added' : 'source already registered'}: ${sources.shorten(added)}`);

    out(done.join('\n'));

    // A check that passes says nothing. There is no step left to take, and
    // announcing PATH on a machine that has it right is how a finished install
    // reads like a failed one. The shell that was already open is the README's,
    // because it is a symptom most runs never produce.
    if (onPath(bin)) return 0;

    const dir = sources.shorten(bin);
    const rc = startupFile();
    out(
      `\n${dir} is not on your PATH, so neither name resolves yet.\n` +
      (rc
        ? `  echo 'export PATH="${forShell(bin)}:$PATH"' >> ${rc}\n`
        : `  put ${dir} on PATH in whatever your shell reads at startup\n`) +
      '  open a new shell, and util ls prints every command'
    );
    return 0;
  },
};
