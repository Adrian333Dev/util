#!/usr/bin/env node
'use strict';
/**
 * description: print a folder as a tree, hiding node_modules, .git and other build folders
 *
 * util fs tree: print a folder and everything inside it as a tree.
 *
 *   util fs tree                    the folder you are in
 *   util fs tree docs               a folder you name
 *   util fs tree --depth 2          stop after two levels
 *   util fs tree --except "*.md"    leave out a file name, a folder name or a glob
 *   util fs tree --into README.md   write the tree into a file instead of printing it
 *
 * --except can be given more than once. node_modules, .git, dist, coverage and
 * the other build folders are hidden already, so use the flag for whatever
 * else this one folder needs gone.
 *
 * A file or folder that describes itself has that description printed beside
 * it, lined up with its neighbours: a `description:` comment in a file, a
 * `.info` file in a folder. `util ls` prints the same line.
 *
 * --into keeps a tree inside a document current. The file needs a line
 * `<!-- tree -->` and a later line `<!-- /tree -->`, and everything between
 * the two is replaced by the tree, in a code block. Markdown shows neither
 * line. The count of folders and files is left out, since a tree trimmed with
 * --except would report 0 files to someone reading the document.
 */

const fs = require('fs');
const path = require('path');
const { clip, describeFile, describeFolder } = require('../../lib/describe');

const ME = 'util fs tree';
const USAGE = `${ME} [path] [--depth N] [--except pattern] [--into file]`;

const die = (message) => {
  process.stderr.write(`${ME}: ${message}\n  usage: ${USAGE}\n`);
  process.exit(1);
};

const HIDDEN = [
  'node_modules', '.git', 'dist', 'build', '.next', '.turbo', '__pycache__',
  '.cache', 'coverage', 'out', '.svelte-kit', 'temp', '.venv', 'vendor', 'tmp',
  '.info',
];

const argv = process.argv.slice(2);
require('../../lib/command').helpOrRun(__filename, argv);

let target = null;
let maxDepth = Infinity;
let into = null;
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

const globToRe = (g) =>
  new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

const excluded = [...HIDDEN.map((n) => globToRe(n)), ...except.map(globToRe)];
const hidden = (name) => excluded.some((re) => re.test(name));

const out = [];
let dirs = 0;
let files = 0;

function walk(dir, prefix, depth) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const rows = entries
    .filter((e) => !hidden(e.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => {
      const full = path.join(dir, e.name);
      const isDir = e.isDirectory();
      return {
        full,
        isDir,
        label: isDir ? e.name + '/' : e.name,
        desc: isDir ? describeFolder(full) : describeFile(full),
      };
    });

  // Siblings align together, so one deep name never pushes the whole tree right.
  const width = Math.max(0, ...rows.filter((r) => r.desc).map((r) => r.label.length));

  rows.forEach((row, i) => {
    const last = i === rows.length - 1;
    row.isDir ? dirs++ : files++;
    out.push(prefix + (last ? '└── ' : '├── ') +
      (row.desc ? row.label.padEnd(width) + '   // ' + clip(row.desc) : row.label));
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
walk(target, '', 1);

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
