'use strict';
/**
 * `util source`: the registry of directories commands are read from.
 *
 * A source is registered once and contributes everything it holds from then
 * on, so adding a command is writing a file rather than running anything. The
 * registry itself is `~/.util/sources`, one path per line, `#` for a comment,
 * and editing it by hand is as supported as these three commands.
 */

const { none, one } = require('../lib/args');
const sources = require('../lib/sources');
const { build } = require('../lib/catalog');
const render = require('../lib/render');

const actions = {};

actions.ls = {
  summary: 'every registered source, and what each one holds',
  run({ positional, usage, out }) {
    none(positional, usage);
    const catalog = build();
    if (!catalog.sources.length) {
      out(`No sources registered. The registry is ${sources.registryFile()}.`);
      return 0;
    }
    for (const source of catalog.sources) {
      const commands = source.namespaces.reduce((n, ns) => n + ns.commands.length, 0);
      out(render.row(0, sources.shorten(source.path),
        source.missing ? 'this path does not exist' : `${commands} command(s)`));
    }
    return 0;
  },
};

actions.add = {
  args: '<path>',
  summary: 'read commands from a directory laid out <namespace>/<command>',
  run({ positional, usage, out }) {
    const { path: added, added: isNew } = sources.add(one(positional, usage));
    out(isNew ? `added: ${added}` : `already registered: ${added}`);
    return 0;
  },
};

actions.drop = {
  args: '<path>',
  summary: 'stop reading commands from a directory',
  run({ positional, usage, out }) {
    out(`dropped: ${sources.drop(one(positional, usage)).path}`);
    return 0;
  },
};

module.exports = {
  summary: 'where commands are read from',
  default: 'ls',
  actions,
};
