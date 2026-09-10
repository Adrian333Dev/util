'use strict';
/**
 * `util uninstall` takes back exactly what `util install` put on the machine.
 *
 * Two symlinks in `~/.local/bin` and one line in the source registry. Nothing
 * else, and nothing that was already there: a source you registered by hand
 * keeps working, `~/.util` stays where it is, and the clone is left alone.
 * Removing the clone is `rm -rf` on a directory, which nobody needs a command
 * for.
 *
 *   util uninstall
 *   util uninstall --bin <path>    where install was given the same flag
 *
 * A name is removed only when it is a symlink into this clone. A real file is
 * somebody else's program, and a symlink into a different clone is a second
 * copy of util that would stop working: both are left in place and named in
 * the output, so `util` still answering afterwards is explained rather than
 * mysterious.
 *
 * Nothing here refuses, and nothing prompts. Everything it removes is one
 * `util install` away from coming back.
 */

const fs = require('fs');
const path = require('path');
const { binDir } = require('../lib/args');
const sources = require('../lib/sources');
const { NAMES } = require('./install');

/** The clone this file came out of, symlinks resolved, same as install's. */
const cloneRoot = () => path.resolve(__dirname, '..');

/**
 * What is sitting at a name: nothing, our link, another clone's, or a real file.
 *
 * `readlink` rather than `realpath`, because a link left behind by a clone that
 * has already been deleted is precisely a link this should remove, and
 * `realpath` throws on it.
 */
function linkState(to, entry) {
  let existing;
  try {
    existing = fs.lstatSync(to);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return { state: 'absent' };
  }
  if (!existing.isSymbolicLink()) return { state: 'real' };
  const target = path.resolve(path.dirname(to), fs.readlinkSync(to));
  return target === entry ? { state: 'ours' } : { state: 'foreign', target };
}

module.exports = {
  summary: 'remove both names from PATH, and unregister this repository',
  run({ positional, usage, out }) {
    const bin = binDir(positional, usage);
    const clone = cloneRoot();
    const entry = path.join(clone, 'util.js');
    const commands = path.join(clone, 'commands');
    const removed = [];
    const kept = [];

    for (const name of NAMES) {
      const to = path.join(bin, name);
      const here = linkState(to, entry);
      const shown = path.join(sources.shorten(bin), name);
      if (here.state === 'ours') {
        fs.rmSync(to);
        removed.push(`unlinked: ${shown}`);
      } else if (here.state === 'real') {
        kept.push(`kept: ${shown} is a real file, so util never linked it`);
      } else if (here.state === 'foreign') {
        kept.push(`kept: ${shown} points at ${sources.shorten(here.target)}, another clone`);
      }
    }

    // Dropped by hand rather than through `sources.drop`, which refuses a path
    // the registry never held. Here that is the ordinary case, not an error.
    const registered = sources.registered().includes(commands);
    if (registered) {
      sources.drop(commands);
      removed.push(`source dropped: ${sources.shorten(commands)}`);
    }

    if (!removed.length) {
      out(
        `util is not installed here: nothing of this clone in ${sources.shorten(bin)}, ` +
        `and ${sources.shorten(commands)} is not a registered source.`
      );
      if (kept.length) out('\n' + kept.join('\n'));
      return 0;
    }

    out([...removed, ...kept].join('\n'));

    // What is left registered is the registry's ordinary state, not something
    // this command did, so it goes unsaid. Empty is the exception: it is the
    // one moment the registry and the clone look deleted too.
    if (!sources.registered().length) {
      const registry = sources.shorten(sources.registryFile());
      out(`\n${registry} is empty now. It stays, and so does the clone.`);
    }
    return 0;
  },
};
