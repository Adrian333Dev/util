'use strict';
/**
 * `util ls`: every source, every namespace, every command, with its summary.
 *
 * The only way to find a command you did not write yourself, so it prints what
 * is wrong as well as what is there: a registry path that has moved, a file
 * without its execute bit, and two sources claiming one name.
 */

const { build } = require('../lib/catalog');
const { none } = require('../lib/args');
const render = require('../lib/render');

module.exports = {
  summary: 'every command, grouped by source and namespace',
  run({ positional, usage, out }) {
    none(positional, usage);
    out(render.listing(build()));
    return 0;
  },
};
