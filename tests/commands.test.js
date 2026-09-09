'use strict';
/**
 * The commands this repository ships, run through `util` rather than by path.
 *
 * Dispatch is covered in `util.test.js` against scratch sources. These tests
 * register the real `commands/` folder instead, so what runs is the file a
 * machine would get, reached the way a machine would reach it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, scratch, write, util } = require('./helpers/scratch');

/**
 * Two clones of one bare remote, the way two machines share one project.
 *
 * `git work` is the only command here that needs a repository rather than a
 * folder, and it is the one command that overwrites files, so its tests build
 * the real thing: a remote, a first commit, and a named machine each side.
 */
function twoMachines(name) {
  const dir = scratch(name);
  const remote = path.join(dir, 'remote.git');
  git(['init', '--bare', '-q', '-b', 'main', remote], dir);

  const desktop = path.join(dir, 'desktop');
  git(['clone', '-q', remote, desktop], dir);
  settle(desktop, 'desktop');
  fs.writeFileSync(path.join(desktop, 'a.txt'), 'one\ntwo\nthree\n');
  fs.writeFileSync(path.join(desktop, 'keep.md'), '# notes\n');
  git(['add', '-A'], desktop);
  git(['commit', '-qm', 'first'], desktop);
  git(['push', '-q', '-u', 'origin', 'main'], desktop);

  const laptop = path.join(dir, 'laptop');
  git(['clone', '-q', remote, laptop], dir);
  settle(laptop, 'laptop');

  return { dir, remote, desktop, laptop };
}

const git = (args, cwd) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `git ${args[0]}: ${r.stderr}`);
  return (r.stdout || '').trim();
};

/** Identity and machine name, local to the clone so no test reads ~/.gitconfig. */
function settle(clone, machine) {
  git(['config', 'user.name', 'scratch'], clone);
  git(['config', 'user.email', 'scratch@example.com'], clone);
  git(['config', 'util.machine', machine], clone);
}

/** Untrimmed: the leading space in ` M a.txt` is what says a file is unstaged. */
const status = (clone) =>
  spawnSync('git', ['status', '--short'], { cwd: clone, encoding: 'utf8' }).stdout;

/** A scratch registry holding this repository's own source and nothing else. */
function shipped(name) {
  const home = scratch(name);
  const added = util(home, ['source', 'add', path.join(ROOT, 'commands')]);
  assert.strictEqual(added.code, 0, added.stderr);
  return home;
}

test('the shipped source lists four namespaces, two of them aliased', () => {
  const home = shipped('shipped-listing');
  const listing = util(home, ['ls']);

  assert.strictEqual(listing.code, 0, listing.stderr);
  // None of the four carries a description: each name already says what it
  // holds, so the `.info` files exist only where an alias needs a home.
  assert.match(listing.stdout, /^ {2}claude$/m);
  assert.match(listing.stdout, /^ {2}fs$/m);
  assert.match(listing.stdout, /^ {2}git · g$/m);
  assert.match(listing.stdout, /^ {2}github · gh$/m);
  for (const name of ['proxy', 'tree', 'merge', 'open', 'link', 'save', 'work', 'clone', 'bookmark']) {
    assert.match(listing.stdout, new RegExp(`\\b${name}\\b`), `${name} is listed`);
  }
});

test('every shipped command prints its own header when asked for help', () => {
  const home = shipped('shipped-help');
  // `git save` is bash and reads its header with awk, because a shell script
  // cannot require lib/command.js. Every other command goes through the shared
  // reader, and the three header styles are all represented here.
  const expected = {
    'fs tree': /^Usage: util fs tree/,
    'fs link': /^Usage: util fs link/,
    'fs open': /^Print a document/,
    'fs merge': /^Merge files and folders/,
    'git work': /^util git work:/,
    'git save': /^util git save/,
    'claude proxy': /^util claude proxy:/,
  };
  for (const [name, opening] of Object.entries(expected)) {
    const run = util(home, [...name.split(' '), '--help']);
    assert.strictEqual(run.code, 0, `${name} --help exits 0: ${run.stderr}`);
    assert.match(run.stdout.trim(), opening, `${name} --help prints its header`);
    assert.doesNotMatch(run.stdout, /^description:/m, `${name} hides the index line`);
  }
});

test('fs tree prints each entry with its own description, and hides the noise', () => {
  const home = shipped('fs-tree');
  const dir = scratch('fs-tree-target');
  write(dir, 'src/parser.js', '// description: Splits the input into tokens.\n');
  write(dir, 'notes.md', '# Notes\n');
  write(dir, 'node_modules/junk/index.js', 'module.exports = 1;\n');

  const result = util(home, ['fs', 'tree', dir]);
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /parser\.js/);
  assert.match(result.stdout, /Splits the input into tokens/);
  assert.doesNotMatch(result.stdout, /node_modules/, 'node_modules is hidden by default');
});

test('fs tree ignores a description inside a fenced block, and takes the one outside it', () => {
  const home = shipped('fs-tree-fences');
  const dir = scratch('fs-tree-fences-target');
  // The shape every page documenting the convention has, this repository's
  // README included: an example above, the page's own marker below.
  write(dir, 'docs/README.md', [
    '# Writing a command',
    '',
    '```bash',
    '# description: the example, which belongs to nothing',
    '```',
    '',
    '<!-- description: how a command gets written -->',
    '',
  ].join('\n'));

  const result = util(home, ['fs', 'tree', dir]);
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /how a command gets written/);
  assert.doesNotMatch(result.stdout, /belongs to nothing/, 'an example is not a description');
});

test('fs tree is reachable by its short name, because no other namespace has a tree', () => {
  const home = shipped('fs-tree-short');
  const dir = scratch('fs-tree-short-target');
  write(dir, 'a.txt', 'x\n');

  const result = util(home, ['tree', dir]);
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /a\.txt/);
});

test('fs merge fences each file under its path, and honours a line range', () => {
  const home = shipped('fs-merge');
  const dir = scratch('fs-merge-target');
  write(dir, 'a.js', 'one\ntwo\nthree\nfour\n');
  write(dir, 'b.md', '# heading\n');

  const whole = util(home, ['fs', 'merge', path.join(dir, 'a.js'), path.join(dir, 'b.md')]);
  assert.strictEqual(whole.code, 0, whole.stderr);
  assert.match(whole.stdout, /^``` .*a\.js$/m, 'the path is the label, with no language beside it');
  assert.match(whole.stdout, /^``` .*b\.md$/m);
  assert.match(whole.stdout, /three/);

  const sliced = util(home, ['fs', 'merge', `${path.join(dir, 'a.js')}:2-3`]);
  assert.strictEqual(sliced.code, 0, sliced.stderr);
  assert.match(sliced.stdout, /two/);
  assert.doesNotMatch(sliced.stdout, /four/, 'a range stops where it says it stops');
});

test('fs merge fences a file longer than the fences inside it', () => {
  const home = shipped('fs-merge-fence');
  const dir = scratch('fs-merge-fence-target');
  write(dir, 'doc.md', ['# Doc', '', '```js', 'let x = 1;', '```', ''].join('\n'));

  const run = util(home, ['fs', 'merge', path.join(dir, 'doc.md')]);
  assert.strictEqual(run.code, 0, run.stderr);
  assert.match(run.stdout, /^```` .*doc\.md$/m, 'three backticks inside means four outside');
  assert.match(run.stdout.trimEnd(), /\n````$/, 'and the block closes on the same width');
  assert.match(run.stdout, /let x = 1;/, 'the inner fence survives whole');
});

test('fs open prints the document itself before the files it names', () => {
  const home = shipped('fs-open');
  const dir = scratch('fs-open-target');
  write(dir, 'a.js', 'one\ntwo\nthree\nfour\n');
  write(dir, 'b.md', '# heading\n');
  write(dir, 'note.md', [
    '# Notes',
    '',
    '```open',
    'a.js',
    'b.md:1-1     # a note beside the path',
    'gone.md',
    '```',
    '',
  ].join('\n'));

  const result = util(home, ['fs', 'open', path.join(dir, 'note.md')], { cwd: dir });
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /^open: note\.md and 2 files, \d+ lines$/m);
  assert.match(result.stdout, /^missing: gone\.md$/m, 'a dead path is named, never fatal');
  assert.match(result.stdout, /^```` note\.md$/m, 'the document leads, fenced wider than its own block');
  assert.match(result.stdout, /# Notes/, 'and the document arrives whole, never as a name');
  assert.match(result.stdout, /^``` a\.js$/m, 'a bare name resolves beside the document');
  assert.match(result.stdout, /three/);
  // The note travels with the document now, so the proof it was never read as
  // part of the path is the label: `b.md:1-1` and nothing after it.
  assert.match(result.stdout, /^``` b\.md:1-1$/m, 'a `#` note is stripped off the path');

  assert.ok(
    result.stdout.indexOf('```` note.md') < result.stdout.indexOf('``` a.js'),
    'the document comes before what it names, whatever the paths sort to',
  );

  const filesOnly = util(home, ['fs', 'open', '--files-only', path.join(dir, 'note.md')], { cwd: dir });
  assert.strictEqual(filesOnly.code, 0, filesOnly.stderr);
  assert.match(filesOnly.stdout, /^open: 2 files, \d+ lines$/m);
  assert.doesNotMatch(filesOnly.stdout, /# Notes/, 'a caller holding the document can skip it');
});

test('fs open still prints a document that carries no block', () => {
  const home = shipped('fs-open-empty');
  const dir = scratch('fs-open-empty-target');
  write(dir, 'plain.md', '# Notes\n\nNothing to load.\n');

  const result = util(home, ['fs', 'open', path.join(dir, 'plain.md')], { cwd: dir });
  assert.strictEqual(result.code, 0, result.stderr);
  assert.match(result.stdout, /^open: plain\.md, no open block, \d+ lines$/m);
  assert.match(result.stdout, /Nothing to load\./, 'no block is never a reason to print nothing');

  const filesOnly = util(home, ['fs', 'open', '--files-only', path.join(dir, 'plain.md')], { cwd: dir });
  assert.match(filesOnly.stdout, /^open: no block in plain\.md$/m, 'an absent block is an answer');
});

test('git work carries an edit, an untracked file and a deletion to the other machine', () => {
  const home = shipped('git-work');
  const { desktop, laptop } = twoMachines('git-work-repos');

  fs.writeFileSync(path.join(desktop, 'a.txt'), 'one\nTWO\nthree\n');
  fs.writeFileSync(path.join(desktop, 'new.txt'), 'brand new\n');
  fs.rmSync(path.join(desktop, 'keep.md'));
  const before = status(desktop);

  const sent = util(home, ['git', 'work', 'send'], { cwd: desktop });
  assert.strictEqual(sent.code, 0, sent.stderr);
  assert.match(sent.stdout, /stored as refs\/unfinished\/desktop\/main/);
  assert.match(sent.stdout, /^pushed to origin$/m);
  assert.strictEqual(status(desktop), before, 'sending changes nothing about the folder it read');

  const listed = util(home, ['git', 'work', 'ls'], { cwd: laptop });
  assert.strictEqual(listed.code, 0, listed.stderr);
  assert.match(listed.stdout, /^desktop +main \* +\d+m ago +3 files$/m);

  const got = util(home, ['git', 'work', 'get'], { cwd: laptop });
  assert.strictEqual(got.code, 0, got.stderr);
  assert.match(got.stdout, /3 files replayed from desktop onto main/);

  assert.strictEqual(fs.readFileSync(path.join(laptop, 'a.txt'), 'utf8'), 'one\nTWO\nthree\n');
  assert.strictEqual(fs.readFileSync(path.join(laptop, 'new.txt'), 'utf8'), 'brand new\n');
  assert.ok(!fs.existsSync(path.join(laptop, 'keep.md')), 'a deletion travels too');
  // Everything comes back the way it was left, in the working tree and not
  // staged. `??` on new.txt is what says nothing was added on arrival.
  assert.match(status(laptop), /^\?\? new\.txt$/m);
  assert.match(status(laptop), /^ M a\.txt$/m);
});

test('git work carries a gitignored file only when .work-include names it', () => {
  const home = shipped('git-work-include');
  const { desktop, laptop } = twoMachines('git-work-include-repos');

  fs.writeFileSync(path.join(desktop, '.gitignore'), '.env.local\nnever.local\n');
  fs.writeFileSync(path.join(desktop, '.env.local'), 'secret\n');
  fs.writeFileSync(path.join(desktop, 'never.local'), 'stays home\n');
  fs.writeFileSync(path.join(desktop, '.work-include'), '# one path per line\n.env.local\n');

  const sent = util(home, ['git', 'work', 'send'], { cwd: desktop });
  assert.strictEqual(sent.code, 0, sent.stderr);

  const got = util(home, ['git', 'work', 'get'], { cwd: laptop });
  assert.strictEqual(got.code, 0, got.stderr);
  assert.strictEqual(fs.readFileSync(path.join(laptop, '.env.local'), 'utf8'), 'secret\n');
  assert.ok(!fs.existsSync(path.join(laptop, 'never.local')), 'an unnamed ignored file stays home');
});

test('git work refuses to send from a machine with no name, and drops a copy on request', () => {
  const home = shipped('git-work-refusals');
  const { desktop, laptop } = twoMachines('git-work-refusals-repos');
  fs.writeFileSync(path.join(desktop, 'a.txt'), 'changed\n');

  git(['config', '--unset', 'util.machine'], desktop);
  const unnamed = util(home, ['git', 'work', 'send'], { cwd: desktop });
  assert.notStrictEqual(unnamed.code, 0, 'two machines sharing a name overwrite each other silently');
  assert.match(unnamed.stderr, /git config --global util\.machine desktop/);

  git(['config', 'util.machine', 'desktop'], desktop);
  assert.strictEqual(util(home, ['git', 'work', 'send'], { cwd: desktop }).code, 0);

  // `drop` reads the labels this clone already has, and only `ls` and `get`
  // fetch. So the listing comes first here, exactly as it would by hand.
  assert.strictEqual(util(home, ['git', 'work', 'ls'], { cwd: laptop }).code, 0);
  const dropped = util(home, ['git', 'work', 'drop', 'desktop'], { cwd: laptop });
  assert.strictEqual(dropped.code, 0, dropped.stderr);
  assert.match(dropped.stdout, /dropped refs\/unfinished\/desktop\/main/);
  assert.match(util(home, ['git', 'work', 'ls'], { cwd: laptop }).stdout, /no stored copies/);
});

test('git work with no action prints help rather than guessing at one', () => {
  const home = shipped('git-work-help');
  const { desktop } = twoMachines('git-work-help-repos');

  // `get` overwrites the folder, so a mistyped action must never fall through
  // to it. Bare exits non-zero; asking for help is a request and exits 0.
  const bare = util(home, ['git', 'work'], { cwd: desktop });
  assert.notStrictEqual(bare.code, 0);
  assert.match(bare.stdout, /util git work send/);

  const asked = util(home, ['git', 'work', '--help'], { cwd: desktop });
  assert.strictEqual(asked.code, 0, asked.stderr);
  assert.doesNotMatch(asked.stdout, /Flow/, 'the provenance note stays out of the help');
});

test('fs link builds a link, repoints its own, and refuses a real file', () => {
  const home = shipped('fs-link');
  const dir = scratch('fs-link-target');
  const source = write(dir, 'real.js', 'module.exports = 1;\n');
  const other = write(dir, 'other.js', 'module.exports = 2;\n');
  const dest = path.join(dir, 'linked.js');

  const first = util(home, ['fs', 'link', source, dest]);
  assert.strictEqual(first.code, 0, first.stderr);
  assert.strictEqual(fs.readlinkSync(dest), source);

  const again = util(home, ['fs', 'link', other, dest]);
  assert.strictEqual(again.code, 0, again.stderr);
  assert.strictEqual(fs.readlinkSync(dest), other, 'a link of its own is repointed, not refused');

  const onto = util(home, ['fs', 'link', source, other]);
  assert.notStrictEqual(onto.code, 0, 'a real file is somebody else\'s');
  assert.match(onto.stderr, /is a real file, not a link/);
  assert.strictEqual(fs.readFileSync(other, 'utf8'), 'module.exports = 2;\n', 'and it survives');
});

test('fs link puts one link per source inside a directory', () => {
  const home = shipped('fs-link-dir');
  const dir = scratch('fs-link-dir-target');
  const a = write(dir, 'a.js', 'a\n');
  const b = write(dir, 'b.js', 'b\n');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);

  const result = util(home, ['fs', 'link', a, b, bin]);
  assert.strictEqual(result.code, 0, result.stderr);
  assert.strictEqual(fs.readlinkSync(path.join(bin, 'a.js')), a);
  assert.strictEqual(fs.readlinkSync(path.join(bin, 'b.js')), b);
});

test('fs link refuses two sources when the target is not a directory', () => {
  const home = shipped('fs-link-many');
  const dir = scratch('fs-link-many-target');
  const a = write(dir, 'a.js', 'a\n');
  const b = write(dir, 'b.js', 'b\n');

  const result = util(home, ['fs', 'link', a, b, path.join(dir, 'nope.js')]);
  assert.notStrictEqual(result.code, 0);
  assert.match(result.stderr, /is not a directory/);
  assert.ok(!fs.existsSync(path.join(dir, 'nope.js')), 'nothing was written before the refusal');
});

test('github clone and bookmark refuse an empty argument list', () => {
  const home = shipped('github-args');

  const clone = util(home, ['github', 'clone']);
  assert.notStrictEqual(clone.code, 0);
  assert.match(clone.stderr, /name at least one repo/);

  const bookmark = util(home, ['gh', 'bookmark']);
  assert.notStrictEqual(bookmark.code, 0);
  assert.match(bookmark.stderr, /name at least one repo/);
});
