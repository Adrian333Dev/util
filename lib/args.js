'use strict';
/**
 * What a builtin accepts.
 *
 * `util` never validates a dispatched command's arguments — it passes them
 * through, because it did not write that program. Its own commands are the
 * exception, and they refuse what they cannot use: a builtin that exits 0
 * having ignored the word you typed reads exactly like success.
 */

const os = require('os');
const path = require('path');
const { UtilError } = require('./error');
const { expand } = require('./sources');

/** A command taking nothing. */
function none(positional, usage) {
  if (positional.length) {
    throw new UtilError(`${usage} takes no arguments, and got "${positional[0]}".`);
  }
}

/** A command taking one thing, which is always a path here. */
function one(positional, usage, what = '<path>') {
  const [value, ...extra] = positional;
  if (!value) throw new UtilError(`usage: ${usage} ${what}`);
  if (extra.length) throw new UtilError(`${usage} takes one ${what.replace(/[<>]/g, '')}.`);
  return value;
}

/**
 * `--bin <path>`, the one flag `install` and `uninstall` share.
 *
 * Read by hand rather than through a general flag layer, because two commands
 * with one flag between them is not a parser. `UTIL_BIN` sets the same
 * directory from the environment, which is what the tests use so that a test
 * naming no directory still cannot touch the machine running the suite.
 */
function binDir(positional, usage) {
  let bin = process.env.UTIL_BIN || path.join(os.homedir(), '.local', 'bin');
  const rest = [...positional];
  while (rest.length) {
    const arg = rest.shift();
    if (arg !== '--bin') {
      throw new UtilError(`${usage} does not take "${arg}".\n  usage: ${usage} [--bin <path>]`);
    }
    const value = rest.shift();
    if (!value) throw new UtilError(`--bin wants a path.\n  usage: ${usage} [--bin <path>]`);
    bin = value;
  }
  return expand(bin);
}

module.exports = { none, one, binDir };
