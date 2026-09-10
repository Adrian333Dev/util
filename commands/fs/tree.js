#!/usr/bin/env node
'use strict';
/**
 * description: a directory tree with the noise stripped out
 *
 * util fs tree: what a folder holds, without the folders nobody reads.
 *
 *   util fs tree                    the tree here
 *   util fs tree docs               the tree under one path
 *   util fs tree --depth 2          stop after two levels
 *   util fs tree --except "*.md"    leave out a name, a folder name or a glob
 *
 * --except is repeatable. Build output and version control are hidden already,
 * node_modules, .git, dist and coverage among them, so the flag is for what
 * this one folder needs gone.
 *
 * A file or folder that describes itself gets that line printed beside it,
 * aligned with its siblings: a description: comment in a file, a .info in a
 * folder. The same line util ls reads.
 */

const fs = require('fs');
const path = require('path');
const { clip, describeFile, describeFolder } = require('../../lib/describe');

const ME = 'util fs tree';
const USAGE = `${ME} [path] [--depth N] [--except pattern]`;

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
  console.error(`${ME}: nothing at ${target}`);
  process.exit(1);
}

out.push(target);
walk(target, '', 1);
out.push('', `${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`);
console.log(out.join('\n'));
