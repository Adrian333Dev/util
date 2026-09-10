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

    fs.mkdirSync(bin, { recursive: true });
    for (const to of targets) {
      fs.rmSync(to, { force: true });
      fs.symlinkSync(entry, to);
      done.push(`linked: ${path.join(sources.shorten(bin), path.basename(to))}`);
    }

    // Registered like any other source, on the same terms. Nothing about this
    // repository's `commands/` is built in, which is what lets a private
    // repository and a project contribute to the same namespaces.
    const { path: added, added: isNew } = sources.add(path.join(clone, 'commands'));
    done.push(`${isNew ? 'source added' : 'source already registered'}: ${sources.shorten(added)}`);

    out(done.join('\n'));
    // The step that bites: a shell open before this ran can hold `util` as a
    // path that no longer exists, and a shell that never had it needs nothing.
    out(
      `\n${sources.shorten(bin)} has to be on your PATH, and then both names work anywhere.\n\n` +
      '  command -v util   says whether this shell can see the link yet\n' +
      '  hash -r           clears a path the shell remembered from before\n\n' +
      'util ls prints every command, this repository\'s included.'
    );
    return 0;
  },
};
