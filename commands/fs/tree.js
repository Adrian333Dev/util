#!/usr/bin/env node
'use strict';
/**
 * util fs tree: print a folder and everything inside it, one line per folder.
 *
 *   util fs tree                    the folder you are in
 *   util fs tree docs               a folder you name
 *   util fs tree --depth 2          stop after two levels
 *   util fs tree --except "*.md"    leave out a file name, a folder name or a glob
 *   util fs tree --draw             draw it as a tree instead
 *   util fs tree --into README.md   write the drawing into a file instead of printing it
 *
 * Each line is a folder's path from the one you named, then its files, each
 * with its line count:
 *
 *   ./: README.md 40, package.json 21
 *   src/: index.js 120, logo.png
 *   src/parser/: lexer.js 88, tokens.js 31
 *
 * A binary file has no count. A folder holding only folders gets no line of
 * its own, since the lines below name it. A folder past --depth is listed by
 * name, ending in a slash, beside its parent's files. This is the shortest
 * form to read, about 40% shorter than the drawing.
 *
 * --except can be given more than once. node_modules, .git, dist, coverage and
 * the other build folders are hidden already, so use the flag for whatever
 * else this one folder needs gone.
 *
 * --into keeps a tree inside a document current. The file needs a line
 * `<!-- tree -->` and a later line `<!-- /tree -->`, and everything between
 * the two is replaced by the drawing, in a code block. Markdown shows neither
 * line. The count of folders and files is left out, since a tree trimmed with
 * --except would report 0 files to someone reading the document. So are the
 * line counts, which would change the document on every edit to any file.
 */

const fs = require('fs');
const path = require('path');

const ME = 'util fs tree';
const USAGE = `${ME} [path] [--depth N] [--except pattern] [--draw] [--into file]`;

const die = (message) => {
  process.stderr.write(`${ME}: ${message}\n  usage: ${USAGE}\n`);
  process.exit(1);
};

const HIDDEN = [
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '__pycache__',
  '.cache', 'coverage', 'out', '.svelte-kit', 'temp', '.venv', 'vendor', 'tmp',
];

const argv = process.argv.slice(2);
require('../../lib/command').helpOrRun(__filename, argv);

let target = null;
let maxDepth = Infinity;
let into = null;
let draw = false;
const except = [];

// Every argument is read, and anything this command cannot use stops it. A
// flag it ignored would print the whole tree and exit 0, which is the answer
// to a question nobody asked and reads exactly like success.
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--depth') {
    const value = argv[i += 1];
    if (value === undefined) die('--depth wants a number.');
    if (!/^\d+$/.test(value)) die(`--depth wants a number, and got "${value}".`);
    maxDepth = Number(value);
  } else if (arg === '--except') {
    const value = argv[i += 1];
    if (value === undefined) die('--except wants a name, a folder name or a glob.');
    except.push(value);
  } else if (arg === '--draw') {
    draw = true;
  } else if (arg === '--into') {
    const value = argv[i += 1];
    if (value === undefined) die('--into wants a file.');
    into = value;
  } else if (arg.startsWith('-')) {
    die(`unknown flag "${arg}".`);
  } else if (target !== null) {
    die(`one path at a time, and got "${target}" and "${arg}".`);
  } else {
    target = arg;
  }
}
if (target === null) target = '.';
// A document always gets the drawing: it is read by people.
if (into !== null) draw = true;

const globToRe = (g) =>
  new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

const excluded = [...HIDDEN.map((n) => globToRe(n)), ...except.map(globToRe)];
const hidden = (name) => excluded.some((re) => re.test(name));

// Past this size a file is a log or a dump, and counting it costs more than
// the number is worth.
const COUNT_LIMIT = 10 * 1024 * 1024;

/** The file's line count, or null for a binary file, a huge one, or --into. */
function lineCount(full) {
  if (into !== null) return null;
  let buf;
  try {
    if (fs.statSync(full).size > COUNT_LIMIT) return null;
    buf = fs.readFileSync(full);
  } catch {
    return null;
  }
  if (buf.subarray(0, 8000).includes(0)) return null;
  let n = 0;
  for (const byte of buf) if (byte === 10) n++;
  return buf.length && buf[buf.length - 1] !== 10 ? n + 1 : n;
}

const out = [];
let dirs = 0;
let files = 0;

/** The entries of a folder worth showing, folders first, or [] if it can't be read. */
function visible(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !hidden(e.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** One line per folder: its path from the target, then its files with their counts. */
function list(dir, rel, depth) {
  const entries = visible(dir);
  const folders = entries.filter((e) => e.isDirectory());
  const deepest = depth + 1 >= maxDepth;
  const parts = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      dirs++;
      if (deepest) parts.push(e.name + '/');
    } else {
      files++;
      const lines = lineCount(path.join(dir, e.name));
      parts.push(lines === null ? e.name : `${e.name} ${lines}`);
    }
  }
  // A folder of folders is named by the lines below it. An empty one still gets its line.
  if (parts.length || folders.length === 0) out.push(`${rel || '.'}/: ${parts.join(', ')}`.trimEnd());
  if (deepest) return;
  for (const f of folders) list(path.join(dir, f.name), rel ? `${rel}/${f.name}` : f.name, depth + 1);
}

function walk(dir, prefix, depth) {
  if (depth > maxDepth) return;

  const rows = visible(dir)
    .map((e) => {
      const full = path.join(dir, e.name);
      const isDir = e.isDirectory();
      const lines = isDir ? null : lineCount(full);
      return {
        full,
        isDir,
        label: isDir ? e.name + '/' : e.name,
        count: lines === null ? '' : `${lines} ${lines === 1 ? 'line' : 'lines'}`,
      };
    });

  // Siblings align together, so one deep name never pushes the whole tree right.
  const width = Math.max(0, ...rows.filter((r) => r.count).map((r) => r.label.length));
  const countWidth = Math.max(0, ...rows.map((r) => r.count.length));

  rows.forEach((row, i) => {
    const last = i === rows.length - 1;
    row.isDir ? dirs++ : files++;
    let line = row.label;
    if (row.count) line = row.label.padEnd(width) + '  ' + row.count.padStart(countWidth);
    out.push((prefix + (last ? '└── ' : '├── ') + line).trimEnd());
    if (row.isDir) walk(row.full, prefix + (last ? '    ' : '│   '), depth + 1);
  });
}

if (!fs.existsSync(target)) {
  console.error(`${ME}: there is nothing at ${target}`);
  process.exit(1);
}

const OPEN = '<!-- tree -->';
const CLOSE = '<!-- /tree -->';

// The document is checked before the walk, so a missing line costs nothing
// and nothing is half-written.
let doc = null;
if (into !== null) {
  try {
    doc = fs.readFileSync(into, 'utf8');
  } catch {
    die(`there is no file at ${into}.`);
  }
  const start = doc.indexOf(OPEN);
  if (start === -1 || doc.indexOf(CLOSE, start) === -1) {
    die(`${into} needs a line "${OPEN}" and a later line "${CLOSE}", and the tree goes between them.`);
  }
}

out.push(target);
if (draw) walk(target, '', 1);
else if (maxDepth >= 1) list(target, '', 0);

if (doc === null) {
  out.push('', `${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`);
  console.log(out.join('\n'));
} else {
  const start = doc.indexOf(OPEN) + OPEN.length;
  const end = doc.indexOf(CLOSE, start);
  const block = '\n```\n' + out.join('\n') + '\n```\n';
  fs.writeFileSync(into, doc.slice(0, start) + block + doc.slice(end));
  console.log(`wrote the tree of ${target} into ${into}`);
}
