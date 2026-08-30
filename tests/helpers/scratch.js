'use strict';
/**
 * A throwaway registry, source tree and project for a test to dispatch against.
 *
 * Everything lands under `tmp/`, which is gitignored. `UTIL_HOME` moves the
 * registry off the real machine and `UTIL_PROJECT` names the project, so no
 * test reads `~/.util` or asks git where it is.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRATCH = path.join(ROOT, 'tmp', 'tests');

/** A fresh folder, wiped first: a test inheriting another's sources fails oddly. */
function scratch(name) {
  const dir = path.join(SCRATCH, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Write a command into a source tree and make it runnable.
 *
 * `body` defaults to a script that prints its own arguments, because most
 * tests are checking where a command was found rather than what it does.
 */
function command(source, relative, body, { executable = true } = {}) {
  const file = path.join(source, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body || '#!/usr/bin/env bash\necho "ran ${0##*/} $*"\n');
  if (executable) fs.chmodSync(file, 0o755);
  return file;
}

function write(dir, relative, body) {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
}

/**
 * Run `util` against a scratch home. Exit status comes back rather than
 * throwing: a refusal is the thing under test as often as the output is.
 */
function util(home, args, options = {}) {
  const { cwd = ROOT, project } = options;
  // Always set, even where a test wants no project source: unset, `util` asks
  // git where it is and finds this repository, so a `.util/` here would leak
  // into every test that never asked for one.
  const none = path.join(SCRATCH, 'no-project');
  fs.mkdirSync(none, { recursive: true });
  const env = { ...process.env, UTIL_HOME: home, UTIL_PROJECT: project || none };
  const result = spawnSync(process.execPath, [path.join(ROOT, 'util.js'), ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return { code: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

module.exports = { ROOT, SCRATCH, scratch, command, write, util };
