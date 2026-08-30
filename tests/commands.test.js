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
const { ROOT, scratch, write, util } = require('./helpers/scratch');

/** A scratch registry holding this repository's own source and nothing else. */
function shipped(name) {
  const home = scratch(name);
  const added = util(home, ['source', 'add', path.join(ROOT, 'commands')]);
  assert.strictEqual(added.code, 0, added.stderr);
  return home;
}

test('the shipped source lists three namespaces, two of them aliased', () => {
  const home = shipped('shipped-listing');
  const listing = util(home, ['ls']);

  assert.strictEqual(listing.code, 0, listing.stderr);
  assert.match(listing.stdout, /fs\s+files and directories/);
  assert.match(listing.stdout, /git · g\s+git, wrapped/);
  assert.match(listing.stdout, /github · gh\s+the GitHub API/);
  for (const name of ['tree', 'merge', 'link', 'save', 'clone', 'bookmark']) {
    assert.match(listing.stdout, new RegExp(`\\b${name}\\b`), `${name} is listed`);
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
  assert.match(whole.stdout, /```javascript .*a\.js/);
  assert.match(whole.stdout, /```markdown .*b\.md/);
  assert.match(whole.stdout, /three/);

  const sliced = util(home, ['fs', 'merge', `${path.join(dir, 'a.js')}:2-3`]);
  assert.strictEqual(sliced.code, 0, sliced.stderr);
  assert.match(sliced.stdout, /two/);
  assert.doesNotMatch(sliced.stdout, /four/, 'a range stops where it says it stops');
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
