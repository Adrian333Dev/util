#!/usr/bin/env node
/**
 * description: the files a document names in its own fenced block, merged
 *
 * Read one document, find its fenced `open` block, and print every file the
 * block names as one stream. The block is a saved argument list for
 * `util fs merge`, which does the printing: same fences, same `:N-M` ranges,
 * same output.
 *
 * ```open
 * plan.md
 * src/parser.js:40-120   # where step 4 stopped
 * ```
 *
 * One path per line, a `#` note beside it, and a line range where one is
 * known. A path resolves beside the named document first, then from the
 * working directory, so a document can name its neighbours by bare filename
 * and everything else from the repository root.
 *
 * Usage: util fs open <file>
 *
 * Was Flow's own `flow-open` block until 2026-09-09, parsed inside `flow get`.
 * It is not a ticket format: any document can carry one.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MERGE = path.join(__dirname, 'merge.js');
const BLOCK_START = /^```open\s*$/;
const BLOCK_END = /^```\s*$/;

/**
 * A fence and not a bullet list, because a fence has hard edges: finding the
 * block is reading from one marker to the next, never a guess about where
 * prose stops.
 */
function readBlock(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => BLOCK_START.test(l));
  if (start === -1) return [];
  const specs = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (BLOCK_END.test(lines[i])) break;
    const spec = lines[i].replace(/(^|\s)#.*$/, '').trim();
    if (spec) specs.push(spec);
  }
  return specs;
}

const splitRange = (spec) => {
  const m = spec.match(/^(.*?)(:\d+-\d+)?$/);
  return { file: m[1], range: m[2] || '' };
};

function resolve(spec, bases) {
  const { file, range } = splitRange(spec);
  for (const base of bases) {
    const abs = path.resolve(base, file);
    if (fs.existsSync(abs)) return abs + range;
  }
  return null;
}

function main() {
  const [target] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!target) {
    process.stderr.write('Usage: util fs open <file>\n');
    process.exit(1);
  }

  const abs = path.resolve(process.cwd(), target);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`No file at ${target}\n`);
    process.exit(1);
  }

  const specs = readBlock(fs.readFileSync(abs, 'utf8'));
  if (!specs.length) {
    process.stdout.write(`open: no block in ${path.relative(process.cwd(), abs) || target}\n`);
    return;
  }

  const bases = [path.dirname(abs), process.cwd()];
  const found = [];
  const missing = [];
  for (const spec of specs) {
    const hit = resolve(spec, bases);
    if (hit) found.push(hit);
    else missing.push(spec);
  }

  let merged = '';
  if (found.length) {
    // `--force`: the block is an explicit list somebody wrote, so the size of
    // it is a decision already made. Truncating it here would drop the file
    // the reader asked for last.
    merged = execFileSync(process.execPath, [MERGE, '--force', ...found], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  }

  const count = `${found.length} file${found.length === 1 ? '' : 's'}`;
  const size = merged ? `, ${merged.split('\n').length} lines` : '';
  process.stdout.write(`open: ${count}${size}\n`);
  if (missing.length) process.stdout.write(`missing: ${missing.join(', ')}\n`);
  if (merged) process.stdout.write(`\n${merged.trimEnd()}\n`);
}

main();
