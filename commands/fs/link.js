#!/usr/bin/env node
// description: build a symlink, refusing to replace a real file
//
// Usage: util fs link <source> <target>
//        util fs link <source>... <directory>
//
//   --force   replace the target even when it is a real file or folder
//
// The target is an absolute path built from where you are standing, so a
// relative source keeps working after the link is made. Naming a directory as
// the last argument puts one link inside it per source, each keeping its own
// basename, the shape `ln -s` uses and the one wanted when linking a folder
// of scripts into ~/.local/bin.
//
// An existing symlink is replaced without asking: pointing a link somewhere new
// is the whole job, and re-running has to be safe. A real file is somebody
// else's and refuses, because a wrong argument here silently destroys work.

const fs = require('fs');
const path = require('path');

const ME = 'util fs link';

const die = (message) => {
  process.stderr.write(`${ME}: ${message}\n`);
  process.exit(1);
};

const argv = process.argv.slice(2);
require('../../lib/command').helpOrRun(__filename, argv);
const force = argv.includes('--force');
const paths = argv.filter((a) => a !== '--force');

if (paths.some((a) => a.startsWith('-'))) {
  die(`unknown flag "${paths.find((a) => a.startsWith('-'))}"\n  ${ME} <source>... <target>`);
}
if (paths.length < 2) {
  die(`two paths at least, a source and a target.\n  ${ME} <source>... <target>`);
}

const sources = paths.slice(0, -1).map((p) => path.resolve(p));
const target = path.resolve(paths[paths.length - 1]);

const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// Several sources only make sense inside a directory, so that reading is
// checked before anything is written rather than after the first link lands.
const intoDir = isDir(target);
if (sources.length > 1 && !intoDir) {
  die(`${paths[paths.length - 1]} is not a directory, and ${sources.length} sources need one.`);
}

/** Point a link at a source, replacing a link that is already there. */
function makeLink(source, dest) {
  if (!fs.existsSync(source)) die(`${source} does not exist`);

  let existing;
  try {
    existing = fs.lstatSync(dest);
  } catch (e) {
    if (e.code !== 'ENOENT') die(`${dest} could not be read (${e.message})`);
  }

  if (existing) {
    if (!existing.isSymbolicLink() && !force) {
      die(`${dest} is a real ${existing.isDirectory() ? 'folder' : 'file'}, not a link.\n` +
          '  Pass --force to replace it, or pick another target.');
    }
    fs.rmSync(dest, { recursive: true, force: true });
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.symlinkSync(source, dest);
  process.stdout.write(`${dest} → ${source}\n`);
}

for (const source of sources) {
  makeLink(source, intoDir ? path.join(target, path.basename(source)) : target);
}
