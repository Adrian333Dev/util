'use strict';
/**
 * The listing: every source, its namespaces, and every command's description.
 *
 * Grouped by source first, because which repository a command comes out of is
 * what you are checking when you run this: whether a private source is even
 * registered, and where the command you just wrote ended up.
 */

const { shorten } = require('./sources');

const INDENT_NS = 2;
const INDENT_CMD = 4;
const NAME = 19;    // characters given to the name before its description
const KIND = 72;    // column the source's own label ends at

const pad = (n) => ' '.repeat(n);

function row(indent, left, right, width = NAME) {
  const start = pad(indent) + left;
  if (!right) return start;
  return start.length < indent + width
    ? start.padEnd(indent + width) + ' ' + right
    : `${start}\n${pad(indent + width + 1)}${right}`;
}

/** A problem, printed under the line it belongs to rather than beside it. */
const note = (indent, text) => pad(indent + NAME + 1) + text;

function header(source) {
  const left = shorten(source.path);
  const right = source.missing ? 'missing' : source.label || (source.kind === 'project' ? 'this project' : '');
  if (!right) return left;
  return left.length + right.length + 1 > KIND
    ? `${left}\n${pad(KIND - right.length)}${right}`
    : left.padEnd(KIND - right.length) + right;
}

function commandLines(catalog, command) {
  const lines = [row(INDENT_CMD, command.name, command.description || '')];

  const clash = (catalog.byFull.get(`${command.namespace}/${command.name}`) || [])
    .filter((c) => c.file !== command.file);
  for (const other of clash) {
    lines.push(note(INDENT_CMD, `also at ${shorten(other.file)}, so this command refuses until one is renamed`));
  }
  if (!command.runnable) {
    lines.push(note(INDENT_CMD, `not executable: chmod +x ${shorten(command.file)}`));
  }
  return lines;
}

function namespaceLines(catalog, ns) {
  const title = ns.alias ? `${ns.name} · ${ns.alias}` : ns.name;
  const lines = [row(INDENT_NS, title, ns.description || '')];
  if (ns.reserved) {
    lines.push(note(INDENT_NS, `util answers "${ns.name}" itself, so nothing in here is reachable`));
  }
  for (const command of ns.commands) lines.push(...commandLines(catalog, command));
  return lines;
}

/**
 * With one source the header is noise, so it is dropped. A source holding no
 * commands keeps its path either way: a registry line pointing at a folder
 * that moved is visible rather than silently inert.
 */
function listing(catalog) {
  const { sources } = catalog;
  if (!sources.length) {
    return 'No sources registered.\n  util source add <path>: a directory laid out <namespace>/<command>';
  }

  const many = sources.length > 1;
  const blocks = [];

  for (const source of sources) {
    const namespaces = source.namespaces.filter((ns) => ns.commands.length);
    const lines = [];
    if (many || !namespaces.length) lines.push(header(source));
    if (!namespaces.length) {
      lines.push(pad(INDENT_NS) + (source.missing ? 'this path does not exist' : 'no commands here'));
    }
    for (const ns of namespaces) {
      if (many || lines.length) lines.push('');
      lines.push(...namespaceLines(catalog, ns));
    }
    blocks.push(lines.join('\n').replace(/^\n/, ''));
  }

  return blocks.join('\n\n');
}

/** One namespace, for `util git` with no command after it. */
function namespace(catalog, ns) {
  const commands = [];
  for (const source of catalog.sources) {
    for (const found of source.namespaces) {
      if (found.name === ns.name) commands.push(...found.commands);
    }
  }
  const title = ns.alias ? `util ${ns.name} · util ${ns.alias}` : `util ${ns.name}`;
  const lines = [ns.description ? `${title}: ${ns.description}` : title, ''];
  for (const command of commands) lines.push(...commandLines(catalog, command));
  if (!commands.length) lines.push(pad(INDENT_CMD) + 'no commands here');
  return lines.join('\n');
}

module.exports = { listing, namespace, header, row };
