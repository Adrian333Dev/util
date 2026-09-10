'use strict';
/**
 * Every source, read into namespaces and commands.
 *
 * A source is a directory laid out `<namespace>/<command>`. A folder inside it
 * is a namespace; a file inside that is a command, named by its filename with
 * any extension dropped. `git/save.sh` is `util git save`, so a script keeps
 * the extension that says what runs it and the command name stays a word.
 *
 * Namespaces merge across sources. Two sources both holding `git/` contribute
 * to one namespace, and only two files claiming the same `namespace/command`
 * are a clash. That clash is recorded rather than thrown: it makes one command
 * refuse and names both files, and it leaves every other command working and
 * `util ls` able to show you what happened.
 */

const fs = require('fs');
const path = require('path');
const { UtilError } = require('./error');
const { describeFile, readInfo } = require('./describe');
const sources = require('./sources');

/** Names `util` answers itself. A namespace called one of these is unreachable. */
const RESERVED = ['ls', 'source', 'help'];

/** Never a command: the folder's own description, a dotfile, or documentation. */
const SKIP = /^\.|\.(md|txt)$/i;

function entries(dir, want) {
  let found;
  try {
    found = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return found
    .filter((e) => (want === 'dir' ? e.isDirectory() : e.isFile() || e.isSymbolicLink()))
    .map((e) => e.name)
    .sort();
}

/** `save.sh` is the command `save`. A name with no extension is already one. */
const commandName = (file) => file.replace(/\.[^.]+$/, '');

const executable = (file) => {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read every source into one catalog.
 *
 * `sources` is the listing shape: one entry per source, in registry order,
 * each holding its namespaces. `index` is the lookup shape: every command
 * keyed by `namespace/command` and again by its bare name, both mapping to a
 * list, because a list of one is a match and a list of two is a clash.
 */
function build() {
  const listing = [];
  const byFull = new Map();
  const byName = new Map();
  const namespaces = new Map();

  for (const source of sources.all()) {
    const info = readInfo(source.path);
    const found = { ...source, label: info.description, missing: !fs.existsSync(source.path), namespaces: [] };
    listing.push(found);

    for (const nsName of entries(source.path, 'dir')) {
      const nsDir = path.join(source.path, nsName);
      const nsInfo = readInfo(nsDir);
      const ns = {
        name: nsName,
        alias: nsInfo.alias,
        description: nsInfo.description,
        reserved: RESERVED.includes(nsName),
        commands: [],
      };
      found.namespaces.push(ns);

      // First source to describe a namespace names it. A second source adding
      // commands to the same namespace inherits the description and the alias
      // rather than competing for them.
      if (!namespaces.has(nsName)) namespaces.set(nsName, ns);
      if (ns.alias && !namespaces.has(ns.alias)) namespaces.set(ns.alias, namespaces.get(nsName));

      for (const file of entries(nsDir, 'file')) {
        if (SKIP.test(file)) continue;
        const full = path.join(nsDir, file);
        const command = {
          namespace: nsName,
          name: commandName(file),
          file: full,
          source: source.path,
          runnable: executable(full),
          description: describeFile(full),
        };
        ns.commands.push(command);

        const key = `${nsName}/${command.name}`;
        byFull.set(key, [...(byFull.get(key) || []), command]);
        byName.set(command.name, [...(byName.get(command.name) || []), command]);
      }
    }
  }

  return { sources: listing, byFull, byName, namespaces };
}

/** A clash, written the same way wherever it surfaces. */
function clashMessage(matches) {
  const key = `${matches[0].namespace}/${matches[0].name}`;
  return `two sources define ${key}:\n` +
    matches.map((c) => `  ${c.file}`).join('\n') +
    '\n  Rename one, or drop a source with util source drop <path>.';
}

/**
 * Find what a typed namespace and command name mean, and refuse where the
 * answer is more than one command.
 */
function resolveCommand(catalog, nsName, name) {
  const matches = catalog.byFull.get(`${nsName}/${name}`) || [];
  if (!matches.length) return null;
  if (matches.length > 1) throw new UtilError(clashMessage(matches));
  return matches[0];
}

/**
 * A word naming no namespace is looked up across all of them. Exactly one
 * command with that name resolves; a second one anywhere fails and prints both
 * full names, so brevity is free until the ambiguity is real.
 */
function resolveShort(catalog, name) {
  const matches = catalog.byName.get(name) || [];
  if (!matches.length) return null;

  const full = new Set(matches.map((c) => `${c.namespace}/${c.name}`));
  if (full.size > 1) {
    throw new UtilError(
      `"${name}" is a command in ${full.size} namespaces:\n` +
      [...full].map((f) => `  util ${f.replace('/', ' ')}`).join('\n') +
      '\n  Name the namespace.'
    );
  }
  if (matches.length > 1) throw new UtilError(clashMessage(matches));
  return matches[0];
}

module.exports = { RESERVED, build, resolveCommand, resolveShort, clashMessage };
