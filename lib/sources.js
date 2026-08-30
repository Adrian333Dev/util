'use strict';
/**
 * The source registry — the list of directories `util` builds its commands from.
 *
 * Nothing is built into `util`. It reads `~/.util/sources`, one path per line,
 * and every directory named there contributes whatever it holds — this
 * repository's own `commands/` included, on exactly the same terms. That is
 * what lets a public repository, a private one and a single project share one
 * namespace without either knowing about the other.
 *
 * A project's own `.util/` is added on top, found from the working directory
 * and never written into the registry. A command written for one repository
 * exists inside that repository and nowhere else.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { UtilError } = require('./error');

/** Everything `util` stores. `UTIL_HOME` moves it, which is what tests use. */
const utilHome = () => process.env.UTIL_HOME || path.join(os.homedir(), '.util');

const registryFile = () => path.join(utilHome(), 'sources');

/** `~/code/util` in the file, an absolute path everywhere else. */
function expand(p) {
  const home = os.homedir();
  if (p === '~') return home;
  if (p.startsWith('~/')) return path.join(home, p.slice(2));
  return path.resolve(p);
}

/** Write it back the way it was typed, so a moved home directory still resolves. */
function shorten(p) {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p;
}

/** Every path in the registry, in file order, comments and blanks dropped. */
function registered() {
  let text;
  try {
    text = fs.readFileSync(registryFile(), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  return text.split('\n')
    .map((l) => l.replace(/\s+#.*$/, '').trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(expand);
}

function writeRegistry(paths) {
  const file = registryFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, paths.map(shorten).join('\n') + (paths.length ? '\n' : ''));
}

function add(typed) {
  const resolved = expand(typed);
  if (!fs.existsSync(resolved)) {
    throw new UtilError(`${resolved} does not exist, so no command could come out of it.`);
  }
  const paths = registered();
  if (paths.includes(resolved)) return { path: resolved, added: false };
  writeRegistry([...paths, resolved]);
  return { path: resolved, added: true };
}

/**
 * Drop by path, without checking the directory is still there. A registry line
 * pointing at a folder somebody deleted is the main reason to reach for this.
 */
function drop(typed) {
  const resolved = expand(typed);
  const paths = registered();
  if (!paths.includes(resolved)) {
    throw new UtilError(
      `${resolved} is not in the registry.\n` +
      '  util source ls prints every path in it.'
    );
  }
  writeRegistry(paths.filter((p) => p !== resolved));
  return { path: resolved };
}

/**
 * The enclosing repository's own `.util/`, or null.
 *
 * `git rev-parse --show-toplevel` rather than a walk up the tree: it already
 * handles worktrees, submodules and symlinked paths, and resolves a nested
 * repository to the nearest enclosing one.
 */
function projectSource() {
  const override = process.env.UTIL_PROJECT;
  const root = override ? path.resolve(override) : gitRoot();
  if (!root) return null;
  const dir = path.join(root, '.util');
  return fs.existsSync(dir) ? dir : null;
}

function gitRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Every source, in the order a listing prints them: the registry as written,
 * then this project. The registry is what a machine always has, and a project
 * source appears and disappears as you move between directories.
 */
function all() {
  const sources = registered().map((p) => ({ path: p, kind: 'registry' }));
  const project = projectSource();
  if (project && !sources.some((s) => s.path === project)) {
    sources.push({ path: project, kind: 'project' });
  }
  return sources;
}

module.exports = { utilHome, registryFile, expand, shorten, registered, add, drop, projectSource, all };
