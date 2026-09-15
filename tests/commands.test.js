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
  // Every command, in every header style: a `/** */` block, a run of `//`
  // lines, a run of `#` lines. The shell scripts read their own header with
  // awk, because a shell script cannot require lib/command.js.
  const commands = [
    'claude proxy', 'fs link', 'fs merge', 'fs open', 'fs tree',
    'git save', 'git work', 'github bookmark', 'github clone',
  ];
  for (const name of commands) {
    const run = util(home, [...name.split(' '), '--help']);
    assert.strictEqual(run.code, 0, `${name} --help exits 0: ${run.stderr}`);
    // One plain sentence, first thing, saying what the command does. A reader
    // asking for help is asking that, and nothing above it answers it.
    assert.match(run.stdout.split('\n')[0], new RegExp(`^util ${name}: .+\\.$`),
      `${name} --help opens on a sentence saying what the command does`);
    assert.doesNotMatch(run.stdout, /^description:/m, `${name} hides the index line`);
    // A header is what a user reads, so it carries no repository history and no
    // note to ourselves. `git work` keeps its provenance in a second comment
    // block, below the one this prints.
    assert.doesNotMatch(run.stdout, /\bWas\b|\bFlow\b|\bTODO\b/,
      `${name} --help carries no provenance and no TODO`);
    assert.doesNotMatch(run.stdout, /^\s*\/\s*$/m,
      `${name} --help drops the comment terminator rather than printing it`);
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

  // No `ls` first: `drop` fetches the labels itself, as `get` does.
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

/**
 * A `gh` that answers from files, so bookmark runs without the network.
 *
 * The real `gh api --jq` applies the filter itself. This one hands the filter
 * to `jq`, which is why these tests skip on a machine without it.
 */
function fakeGitHub(name, repos) {
  const dir = scratch(name);
  const bin = path.join(dir, 'bin');
  write(bin, 'gh', '#!/usr/bin/env bash\nexec jq -r "$4" "$(dirname "$0")/../repos/${2#repos/}.json"\n');
  fs.chmodSync(path.join(bin, 'gh'), 0o755);
  for (const repo of repos) write(dir, `repos/${repo.full_name}.json`, JSON.stringify(repo));
  return { dir, env: { PATH: `${bin}:${process.env.PATH}` } };
}

const hasJq = spawnSync('jq', ['--version']).status === 0;

const MEM0 = {
  full_name: 'mem0ai/mem0',
  html_url: 'https://github.com/mem0ai/mem0',
  stargazers_count: 64712,
  language: 'Python',
  pushed_at: '2026-09-03T10:00:00Z',
  archived: false,
  description: 'The Memory Layer: "drop-in"   memory\nfor agents',
};

test('fs tree reads a quoted description without its quotes and escapes', () => {
  const home = shipped('fs-tree-quoted');
  const dir = scratch('fs-tree-quoted-target');
  write(dir, 'mem0ai_mem0.md', '---\ndescription: "The Memory Layer: \\"drop-in\\" memory for agents"\n---\n');
  write(dir, 'someone_old-skill.md', '---\ndescription: ""\n---\n');

  const tree = util(home, ['fs', 'tree', dir]);
  assert.match(tree.stdout, /mem0ai_mem0\.md\s+\/\/ The Memory Layer: "drop-in" memory for agents/);
  assert.doesNotMatch(tree.stdout, /someone_old-skill\.md\s+\/\//, 'an empty description prints nothing');
});

test('github bookmark adds a line named owner/repo to a file, once', { skip: !hasJq && 'needs jq' }, () => {
  const home = shipped('bookmark-line');
  const { dir, env } = fakeGitHub('bookmark-line-gh', [MEM0]);
  const list = path.join(dir, 'list.md');

  const first = util(home, ['gh', 'bookmark', 'mem0ai/mem0', '--to', list], { env });
  assert.strictEqual(first.code, 0, first.stderr);
  const second = util(home, ['gh', 'bookmark', 'git@github.com:mem0ai/mem0.git', '--to', list], { env });
  assert.strictEqual(second.code, 0, second.stderr);
  assert.match(second.stderr, /already in/);

  assert.strictEqual(fs.readFileSync(list, 'utf8'),
    '- [mem0ai/mem0](https://github.com/mem0ai/mem0) (`64.7k★` · `Python` · pushed 2026-09-03): ' +
    'The Memory Layer: "drop-in" memory for agents\n');
});

test('fs tree --into replaces only what sits between the two tree lines', () => {
  const home = shipped('fs-tree-into');
  const dir = scratch('fs-tree-into-target');
  write(dir, 'software/.info', 'everything else\n');
  write(dir, 'agent-tools/.info', 'made for AI agents\n');
  const readme = write(scratch('fs-tree-into-doc'), 'README.md',
    '# Toolbox\n\nHow to add a tool.\n\n<!-- tree -->\nold tree\n<!-- /tree -->\n\nThe end.\n');

  const result = util(home, ['fs', 'tree', dir, '--into', readme]);
  assert.strictEqual(result.code, 0, result.stderr);

  const text = fs.readFileSync(readme, 'utf8');
  assert.ok(text.startsWith('# Toolbox\n\nHow to add a tool.\n\n<!-- tree -->\n```\n'), text);
  assert.ok(text.endsWith('\n```\n<!-- /tree -->\n\nThe end.\n'), text);
  assert.match(text, /agent-tools\/\s+\/\/ made for AI agents/);
  assert.doesNotMatch(text, /old tree/);
  assert.doesNotMatch(text, /directories/, 'no count inside a document');

  // Run twice, the document comes out the same.
  util(home, ['fs', 'tree', dir, '--into', readme]);
  assert.strictEqual(fs.readFileSync(readme, 'utf8'), text);
});

test('fs tree --into refuses a file missing either tree line, and leaves it alone', () => {
  const home = shipped('fs-tree-into-refuse');
  const dir = scratch('fs-tree-into-refuse-target');
  const readme = write(dir, 'README.md', '# Toolbox\n\n<!-- tree -->\n');

  const result = util(home, ['fs', 'tree', dir, '--into', readme]);
  assert.notStrictEqual(result.code, 0);
  assert.match(result.stderr, /needs a line "<!-- tree -->" and a later line "<!-- \/tree -->"/);
  assert.strictEqual(fs.readFileSync(readme, 'utf8'), '# Toolbox\n\n<!-- tree -->\n');
});

test('git save with no message names what changed and counts the lines', () => {
  const home = shipped('git-save-message');
  const repo = scratch('git-save-message-repo');
  git(['init', '-q', '-b', 'main'], repo);
  settle(repo, 'desktop');
  const save = () => {
    const saved = util(home, ['git', 'save', '-n'], { cwd: repo });
    assert.strictEqual(saved.code, 0, saved.stderr);
    return git(['log', '-1', '--format=%s'], repo);
  };

  write(repo, 'backlog.md', 'one\ntwo\nthree\n');
  assert.strictEqual(save(), 'backlog.md (new) +3');

  write(repo, 'backlog.md', 'one\nTWO\nthree\nfour\n');
  write(repo, 'README.md', '# readme\n');
  assert.strictEqual(save(), 'README.md, backlog.md +3 -1', 'not every file is new, so no (new)');

  git(['mv', 'README.md', 'docs.md'], repo);
  assert.strictEqual(save(), 'README.md → docs.md');

  for (const name of ['a', 'b', 'c', 'd']) write(repo, `skills/dev/fold/${name}.md`, 'x\n');
  assert.strictEqual(save(), 'skills/dev/fold: 4 files (new) +4', 'the deepest folder holding all 4');

  for (const name of ['a', 'b', 'c']) write(repo, `docs/dev/${name}.md`, 'y\n');
  write(repo, 'backlog.md', 'one\n');
  write(repo, 'docs.md', '# docs\n');
  assert.strictEqual(save(), 'docs/dev, backlog.md, docs.md: 5 files +4 -4', 'largest group first');

  fs.rmSync(path.join(repo, 'skills'), { recursive: true });
  assert.strictEqual(save(), 'skills/dev/fold: 4 files (deleted) -4');

  const long = 'a-folder-name-long-enough-to-matter';
  for (const name of ['one', 'two', 'three']) write(repo, `${long}/${name}/deeper/still/${name}.md`, 'z\n');
  write(repo, 'notes.md', 'z\n');
  assert.strictEqual(save(), `${long}, notes.md: 4 files (new) +4`, 'past 72 characters, top-level names');
});
