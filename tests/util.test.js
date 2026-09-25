'use strict';
/**
 * `util`: the registry, the resolution rules, and handing a command the
 * arguments it was given.
 *
 * Every test runs against a scratch `UTIL_HOME` and a scratch source tree, so
 * nothing here reads the registry on the machine running it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RESERVED } = require('../lib/catalog');
const { ROOT, scratch, command, write, util } = require('./helpers/scratch');

/**
 * A path the way `util` prints it, and the way a shell config takes it.
 *
 * Written out here rather than imported from `lib/sources`: an expectation the
 * code under test computed for itself cannot catch that code being wrong.
 */
const HOME_DIR = os.homedir();
const shown = (p) => (p === HOME_DIR || p.startsWith(HOME_DIR + path.sep)
  ? '~' + p.slice(HOME_DIR.length)
  : p);
const forShell = (p) => (shown(p).startsWith('~/') ? `$HOME/${shown(p).slice(2)}` : p);

/** A home, a source folder registered in it, and `util` bound to both. */
function setup(name) {
  const dir = scratch(name);
  const home = path.join(dir, 'home');
  const source = path.join(dir, 'source');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'sources'), source + '\n');
  return { dir, home, source, run: (args, options) => util(home, args, options) };
}

test('a source is added, listed and dropped, and the registry survives all three', () => {
  const dir = scratch('registry');
  const home = path.join(dir, 'home');
  const source = path.join(dir, 'source');
  command(source, 'git/save.sh');

  const added = util(home, ['source', 'add', source]);
  assert.strictEqual(added.code, 0, added.stderr);
  assert.match(added.stdout, /^added: /);

  const again = util(home, ['source', 'add', source]);
  assert.match(again.stdout, /already registered/, 'adding twice never duplicates a line');

  const listed = util(home, ['source', 'ls']);
  assert.match(listed.stdout, /source\s+1 command\(s\)/);

  const dropped = util(home, ['source', 'drop', source]);
  assert.strictEqual(dropped.code, 0, dropped.stderr);
  assert.strictEqual(fs.readFileSync(path.join(home, 'sources'), 'utf8'), '');

  const gone = util(home, ['source', 'drop', source]);
  assert.notStrictEqual(gone.code, 0, 'dropping what is not registered fails');
  assert.match(gone.stderr, /is not in the registry/);
});

test('adding a path that does not exist fails rather than registering it', () => {
  const dir = scratch('registry-missing');
  const home = path.join(dir, 'home');
  const result = util(home, ['source', 'add', path.join(dir, 'nowhere')]);
  assert.notStrictEqual(result.code, 0);
  assert.match(result.stderr, /does not exist/);
  assert.ok(!fs.existsSync(path.join(home, 'sources')), 'nothing was written');
});

test('a command runs from its namespace, and its arguments pass through untouched', () => {
  const { source, run } = setup('dispatch');
  command(source, 'git/save.sh');

  const ran = run(['git', 'save', '--dry-run', 'a message']);
  assert.strictEqual(ran.code, 0, ran.stderr);
  assert.strictEqual(ran.stdout.trim(), 'ran save.sh --dry-run a message');
});

test('the command name is the filename with its extension dropped', () => {
  const { source, run } = setup('extension');
  command(source, 'fs/tree.js', '#!/usr/bin/env node\n// util fs tree: a tree.\nconsole.log("tree");\n');

  assert.match(run(['ls']).stdout, /tree\s+a tree/);
  assert.strictEqual(run(['fs', 'tree']).stdout.trim(), 'tree');
});

test('an exit code comes back from the command rather than being swallowed', () => {
  const { source, run } = setup('exit-code');
  command(source, 'git/fail.sh', '#!/usr/bin/env bash\necho "no" >&2\nexit 3\n');

  const ran = run(['git', 'fail']);
  assert.strictEqual(ran.code, 3);
  assert.match(ran.stderr, /^no$/m);
});

test('a name unique across namespaces resolves on its own, and a second one fails', () => {
  const { source, run } = setup('short-name');
  command(source, 'fs/tree.sh');

  assert.strictEqual(run(['tree']).stdout.trim(), 'ran tree.sh', 'unique, so the short form works');

  // The day a second `tree` exists anywhere, the short form has to stop
  // guessing. Both full names print, so the fix is one word of typing.
  command(source, 'git/tree.sh');
  const ambiguous = run(['tree']);
  assert.notStrictEqual(ambiguous.code, 0);
  assert.match(ambiguous.stderr, /"tree" is a command in 2 namespaces/);
  assert.match(ambiguous.stderr, /util fs tree/);
  assert.match(ambiguous.stderr, /util git tree/);
  assert.strictEqual(run(['fs', 'tree']).stdout.trim(), 'ran tree.sh', 'the long form still works');
});

test('two sources claiming one namespace/command refuse and name both files', () => {
  const dir = scratch('clash');
  const home = path.join(dir, 'home');
  const first = path.join(dir, 'public');
  const second = path.join(dir, 'private');
  command(first, 'git/save.sh');
  command(second, 'git/save.sh');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'sources'), `${first}\n${second}\n`);

  const clash = util(home, ['git', 'save']);
  assert.notStrictEqual(clash.code, 0, 'silent shadowing is the bug nobody finds');
  assert.match(clash.stderr, /two sources define git\/save/);
  assert.match(clash.stderr, new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(clash.stderr, new RegExp(second.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // A clash refuses one command and leaves the rest of the catalog working.
  command(second, 'git/push.sh');
  assert.strictEqual(util(home, ['git', 'push']).stdout.trim(), 'ran push.sh');
  assert.match(util(home, ['ls']).stdout, /this command refuses until one is renamed/);
});

test("a project's own .util/ is picked up, and disappears outside that project", () => {
  const { dir, source, run } = setup('project-source');
  command(source, 'git/save.sh');
  const project = path.join(dir, 'project');
  command(path.join(project, '.util'), 'aws/push.sh');

  const inside = run(['ls'], { project });
  assert.match(inside.stdout, /aws/, 'a command written in the repository that needs it');
  assert.strictEqual(run(['aws', 'push'], { project }).stdout.trim(), 'ran push.sh');

  const outside = run(['ls']);
  assert.doesNotMatch(outside.stdout, /aws/, 'and nowhere else');
});

test('a command without its execute bit says so instead of failing obscurely', () => {
  const { source, run } = setup('not-executable');
  command(source, 'git/save.sh', null, { executable: false });

  const ran = run(['git', 'save']);
  assert.notStrictEqual(ran.code, 0);
  assert.match(ran.stderr, /is not executable/);
  assert.match(ran.stderr, /chmod \+x/);
  assert.match(run(['ls']).stdout, /not executable/, 'and the listing shows it too');
});

test('a namespace names its alias in .alias, and both names reach the command', () => {
  const { source, run } = setup('alias');
  command(source, 'git/save.sh');
  write(source, 'git/.alias', 'g\n');

  assert.match(run(['ls']).stdout, /^ {2}git · g$/m);
  assert.strictEqual(run(['g', 'save']).stdout.trim(), 'ran save.sh');
  assert.match(run(['g']).stdout, /^util git · util g$/m);
});

test('the summary is the header\'s first sentence, and a command with no header still lists', () => {
  const { source, run } = setup('summaries');
  command(source, 'git/save.sh',
    '#!/usr/bin/env bash\n# util git save: add, commit and push\n# in one step. Then more.\n#\n# Usage.\nexit 0\n');
  command(source, 'git/bare.sh');

  const listed = run(['ls']).stdout;
  assert.match(listed, /save\s+add, commit and push in one step$/m);
  assert.match(listed, /^\s+bare\s*$/m, 'the gap is the reminder, so the name still prints');
});

test('a registry path that has moved is visible rather than silently inert', () => {
  const dir = scratch('missing-source');
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'sources'), path.join(dir, 'moved') + '\n');

  assert.match(util(home, ['ls']).stdout, /this path does not exist/);
  assert.match(util(home, ['source', 'ls']).stdout, /this path does not exist/);
});

test('a namespace named after a builtin is unreachable, and the listing says so', () => {
  const { source, run } = setup('reserved');
  command(source, 'ls/thing.sh');

  assert.match(run(['ls']).stdout, /util answers "ls" itself/);
});

test('an unknown word names what is available instead of failing bare', () => {
  const { source, run } = setup('unknown');
  command(source, 'git/save.sh');

  const wrong = run(['nope']);
  assert.notStrictEqual(wrong.code, 0);
  assert.match(wrong.stderr, /neither a namespace nor a command/);
  assert.match(wrong.stderr, /namespaces: git/);

  const wrongCommand = run(['git', 'nope']);
  assert.notStrictEqual(wrongCommand.code, 0);
  assert.match(wrongCommand.stderr, /git has no command "nope"/);
});

test('with two sources each gets a header', () => {
  const dir = scratch('two-sources');
  const home = path.join(dir, 'home');
  const pub = path.join(dir, 'public');
  const priv = path.join(dir, 'private');
  command(pub, 'git/save.sh');
  command(priv, 'aws/push.sh');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'sources'), `${pub}\n${priv}\n`);

  const listed = util(home, ['ls']).stdout;
  assert.match(listed, /public$/m, 'a source is headed by its path');
  assert.match(listed, /private$/m);

  // One source and the header is noise, so it goes.
  util(home, ['source', 'drop', priv]);
  assert.doesNotMatch(util(home, ['ls']).stdout, /public$/m);
});

test('a builtin refuses a word it cannot use rather than ignoring it', () => {
  const { run } = setup('builtin-args');

  const extra = run(['ls', 'git']);
  assert.notStrictEqual(extra.code, 0, 'exiting 0 having ignored it reads as success');
  assert.match(extra.stderr, /util ls takes no arguments/);

  const bare = run(['source', 'add']);
  assert.notStrictEqual(bare.code, 0);
  assert.match(bare.stderr, /usage: util source add <path>/);
});

test('install links both names and registers this repository as a source', () => {
  const dir = scratch('install');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');

  const result = util(home, ['install'], { bin });
  assert.strictEqual(result.code, 0, result.stderr);

  const entry = path.join(ROOT, 'util.js');
  for (const name of ['util', 'u']) {
    const linked = path.join(bin, name);
    assert.ok(fs.lstatSync(linked).isSymbolicLink(), `${name} is a link`);
    assert.strictEqual(fs.readlinkSync(linked), entry, `${name} points at the entry point`);
  }

  assert.match(fs.readFileSync(path.join(home, 'sources'), 'utf8'), /commands$/m);
  assert.match(util(home, ['ls']).stdout, /save/, 'the registered source contributes commands');
});

test('install runs twice with the same result', () => {
  const dir = scratch('install-twice');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');

  util(home, ['install'], { bin });
  const again = util(home, ['install'], { bin });
  assert.strictEqual(again.code, 0, again.stderr);
  assert.match(again.stdout, /source already registered/);
  assert.doesNotMatch(again.stdout, /^linked:/m,
    'a name already pointing at this clone reads as already linked, not as work redone');
  assert.strictEqual(again.stdout.match(/^already linked:/gm).length, 2, 'both names');

  const registry = fs.readFileSync(path.join(home, 'sources'), 'utf8');
  assert.strictEqual(registry.trim().split('\n').length, 1, 'the source is registered once');
  assert.strictEqual(fs.readlinkSync(path.join(bin, 'util')), path.join(ROOT, 'util.js'));
});

test('install repoints a link left by an older clone', () => {
  const dir = scratch('install-repoint');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const old = path.join(dir, 'old-clone', 'util.js');
  fs.mkdirSync(path.dirname(old), { recursive: true });
  fs.writeFileSync(old, '');
  fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(old, path.join(bin, 'util'));

  const result = util(home, ['install'], { bin });
  assert.strictEqual(result.code, 0, result.stderr);
  assert.strictEqual(fs.readlinkSync(path.join(bin, 'util')), path.join(ROOT, 'util.js'),
    'moving the clone and re-running is what points the name at the new one');
});

test('install refuses a real file on PATH, and writes nothing at all', () => {
  const dir = scratch('install-real-file');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  // The second name, so the first one would already be linked if the check
  // ran per name rather than over all of them first.
  fs.writeFileSync(path.join(bin, 'u'), 'somebody else\n');

  const result = util(home, ['install'], { bin });
  assert.notStrictEqual(result.code, 0);
  assert.match(result.stderr, /is a real file, not a link/);
  assert.strictEqual(fs.readFileSync(path.join(bin, 'u'), 'utf8'), 'somebody else\n');
  assert.ok(!fs.existsSync(path.join(bin, 'util')), 'a refusal leaves the machine as it was');
  assert.ok(!fs.existsSync(path.join(home, 'sources')), 'and registers nothing');
});

test('uninstall removes both names and unregisters this repository', () => {
  const dir = scratch('uninstall');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');

  util(home, ['install'], { bin });
  const result = util(home, ['uninstall'], { bin });
  assert.strictEqual(result.code, 0, result.stderr);

  for (const name of ['util', 'u']) {
    assert.ok(!fs.existsSync(path.join(bin, name)), `${name} is gone from PATH`);
  }
  assert.strictEqual(fs.readFileSync(path.join(home, 'sources'), 'utf8').trim(), '',
    'the source this repository registered is gone with it');
  assert.match(result.stdout, /is empty now/, 'and the registry itself stays on disk');
});

test('uninstall leaves every source it did not add', () => {
  const dir = scratch('uninstall-private');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const private_ = path.join(dir, 'private');
  command(private_, path.join('git', 'mine'));

  util(home, ['install'], { bin });
  util(home, ['source', 'add', private_]);
  const result = util(home, ['uninstall'], { bin });

  assert.strictEqual(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /registered in/,
    'what stays in the registry is its ordinary state, not something uninstall did');
  const registry = fs.readFileSync(path.join(home, 'sources'), 'utf8');
  assert.strictEqual(registry.trim().split('\n').length, 1, 'one line, and it is not this clone\'s');
  assert.match(registry, /private$/m);
  assert.match(util(home, ['ls']).stdout, /mine/, 'a private source keeps working alone');
});

test('uninstall says so when there is nothing of this clone here', () => {
  const dir = scratch('uninstall-absent');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');

  const result = util(home, ['uninstall'], { bin });
  assert.strictEqual(result.code, 0, 'already gone is not a failure');
  assert.match(result.stdout, /util is not installed here/);

  util(home, ['install'], { bin });
  util(home, ['uninstall'], { bin });
  const again = util(home, ['uninstall'], { bin });
  assert.strictEqual(again.code, 0, again.stderr);
  assert.match(again.stdout, /util is not installed here/, 'and running it twice is safe');
});

test('uninstall keeps a real file and another clone\'s link, and names both', () => {
  const dir = scratch('uninstall-foreign');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const other = path.join(dir, 'other-clone', 'util.js');

  util(home, ['install'], { bin });
  // `u` is somebody else's program, and `util` now points at a second copy of
  // util: removing either would break something this install never made.
  fs.rmSync(path.join(bin, 'u'));
  fs.writeFileSync(path.join(bin, 'u'), 'somebody else\n');
  fs.mkdirSync(path.dirname(other), { recursive: true });
  fs.writeFileSync(other, '');
  fs.rmSync(path.join(bin, 'util'));
  fs.symlinkSync(other, path.join(bin, 'util'));

  const result = util(home, ['uninstall'], { bin });
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /is a real file, so util never linked it/);
  assert.match(result.stdout, /another clone/);
  assert.strictEqual(fs.readFileSync(path.join(bin, 'u'), 'utf8'), 'somebody else\n');
  assert.strictEqual(fs.readlinkSync(path.join(bin, 'util')), other);
  assert.match(result.stdout, /source dropped/, 'the registry line is still this clone\'s to remove');
});

test('install names the PATH step only where it is missing', () => {
  const dir = scratch('install-path');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');

  const missing = util(home, ['install'], { bin, env: { PATH: '/usr/bin' } });
  assert.strictEqual(missing.code, 0, missing.stderr);
  assert.match(missing.stdout, /is not on your PATH/);
  assert.match(missing.stdout, /export PATH=/, 'and the line to fix it');

  const found = util(home, ['install'], { bin, env: { PATH: `${bin}:/usr/bin` } });
  assert.strictEqual(found.code, 0, found.stderr);
  assert.doesNotMatch(found.stdout, /PATH/, 'a check that passes has no step attached, so it says nothing');
  assert.strictEqual(found.stdout.trim().split('\n').length, 3,
    'two names and one source: every line is something that changed');
});

test('a word one typo away from a real name suggests that name', () => {
  const { source, run } = setup('suggest');
  command(source, 'git/save.sh');

  const builtin = run(['unistall']);
  assert.notStrictEqual(builtin.code, 0);
  assert.match(builtin.stderr, /did you mean "uninstall"\?/);

  const inNamespace = run(['git', 'svae']);
  assert.notStrictEqual(inNamespace.code, 0);
  assert.match(inNamespace.stderr, /did you mean "save"\?/);

  const nothing = run(['xyzzy']);
  assert.notStrictEqual(nothing.code, 0);
  assert.doesNotMatch(nothing.stderr, /did you mean/, 'a guess at nothing is worse than none');

  const action = run(['source', 'drpo', '/tmp']);
  assert.notStrictEqual(action.code, 0);
  assert.match(action.stderr, /unknown source action "drpo"/, 'not an argument to the default action');
  assert.match(action.stderr, /did you mean "drop"\?/);
});

test('two letters swapped is one typo, and an alias never ties with its own namespace', () => {
  const { source, run } = setup('suggest-swap');
  command(source, 'git/save.sh');
  write(source, path.join('git', '.alias'), 'g\n');

  // git, g and gh are all two plain edits from gti. A swap counts as one, so
  // git wins outright, and g would answer as git anyway.
  const swapped = run(['gti', 'save']);
  assert.notStrictEqual(swapped.code, 0);
  assert.match(swapped.stderr, /did you mean "git"\?/);
});

// The commands below exist to print, so their output is the product rather
// than a side effect of it. Each assertion here takes the whole of stdout.
// One regex per test is what let `install` report `linked:` for a name it had
// not touched: the line was never read, because no assertion covered it.

test('install prints exactly what it changed, and a re-run exactly what it did not', () => {
  const dir = scratch('install-exact');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const env = { PATH: `${bin}:/usr/bin` };
  const commands = shown(path.join(ROOT, 'commands'));

  const first = util(home, ['install'], { bin, env });
  assert.strictEqual(first.stderr, '');
  assert.strictEqual(first.stdout,
    `linked: ${shown(path.join(bin, 'util'))}\n` +
    `linked: ${shown(path.join(bin, 'u'))}\n` +
    `source added: ${commands}\n`,
    'a directory already on PATH leaves no step to take, so nothing is said about it');

  const again = util(home, ['install'], { bin, env });
  assert.strictEqual(again.stdout,
    `already linked: ${shown(path.join(bin, 'util'))}\n` +
    `already linked: ${shown(path.join(bin, 'u'))}\n` +
    `source already registered: ${commands}\n`,
    'a second run reports nothing done, because it did nothing');
});

test('install off PATH prints exactly the step that is left', () => {
  const dir = scratch('install-exact-path');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');

  const result = util(home, ['install'], { bin, env: { PATH: '/usr/bin', SHELL: '/bin/bash' } });
  assert.strictEqual(result.stdout,
    `linked: ${shown(path.join(bin, 'util'))}\n` +
    `linked: ${shown(path.join(bin, 'u'))}\n` +
    `source added: ${shown(path.join(ROOT, 'commands'))}\n` +
    '\n' +
    `${shown(bin)} is not on your PATH, so neither name resolves yet.\n` +
    `  echo 'export PATH="${forShell(bin)}:$PATH"' >> ~/.bashrc\n` +
    '  open a new shell, and util ls prints every command\n');
});

test('uninstall prints exactly what it removed, and names the registry only when it empties', () => {
  const dir = scratch('uninstall-exact');
  const home = path.join(dir, 'home');
  const bin = path.join(dir, 'bin');
  const other = path.join(dir, 'private');
  command(other, path.join('git', 'mine'));

  const gone =
    `unlinked: ${shown(path.join(bin, 'util'))}\n` +
    `unlinked: ${shown(path.join(bin, 'u'))}\n` +
    `source dropped: ${shown(path.join(ROOT, 'commands'))}\n`;

  util(home, ['install'], { bin });
  util(home, ['source', 'add', other]);
  assert.strictEqual(util(home, ['uninstall'], { bin }).stdout, gone,
    'a source left registered is the registry as it always was, not something uninstall did');

  util(home, ['source', 'drop', other]);
  util(home, ['install'], { bin });
  assert.strictEqual(util(home, ['uninstall'], { bin }).stdout,
    gone + '\n' +
    `${shown(path.join(home, 'sources'))} is empty now. The file stays, and so does the clone.\n`,
    'an empty registry is the one moment the clone looks deleted too');
});

test('the listing prints exactly this', () => {
  const { source, run } = setup('listing-exact');
  write(source, path.join('git', '.alias'), 'g\n');
  command(source, path.join('git', 'save.sh'), '#!/usr/bin/env bash\n# util git save: commit and push.\n');
  command(source, path.join('fs', 'tree.sh'), '#!/usr/bin/env bash\n# util fs tree: print a tree.\n');

  assert.strictEqual(run(['ls']).stdout,
    '  fs\n' +
    '    tree                print a tree\n' +
    '\n' +
    '  git · g\n' +
    '    save                commit and push\n',
    'one source needs no header');
});

test('help carries a row for every word util answers itself, and closes on the listing', () => {
  const { source, run } = setup('help-exact');
  command(source, path.join('git', 'save.sh'), '#!/usr/bin/env bash\n# util git save: commit and push.\n');

  const help = run(['help']).stdout;
  for (const word of RESERVED) {
    // `help` is how you got here, so it lists no row for itself.
    if (word === 'help') continue;
    assert.match(help, new RegExp(`^  util ${word}\\b`, 'm'), `util help has a row for ${word}`);
  }
  assert.ok(help.endsWith(run(['ls']).stdout),
    'the listing under help is the one util ls prints, never a second rendering of it');
});
