'use strict';
/**
 * What a builtin accepts.
 *
 * `util` never validates a dispatched command's arguments — it passes them
 * through, because it did not write that program. Its own commands are the
 * exception, and they refuse what they cannot use: a builtin that exits 0
 * having ignored the word you typed reads exactly like success.
 */

const { UtilError } = require('./error');

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

module.exports = { none, one };
