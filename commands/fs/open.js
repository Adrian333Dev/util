#!/usr/bin/env node
/**
 * description: one document and every file it names, as one stream
 *
 * Print a document, then print every file its fenced `open` block names. One
 * command replaces reading the document and then chasing what it points at.
 * The document comes first, whole, and the files follow in block order.
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
 * `util fs merge` does the printing, so the fences, the path labels and the
 * `:N-M` ranges are its output, not a second format.
 *
 * Usage: util fs open [--files-only] <file>
 *
 * Options:
 *   --files-only   Skip the document, print only what its block names. For a
 *                  caller that has already put the document on screen, which
 *                  is what `flow get --files` does with a ticket.
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

/**
 * `--force`: the block is an explicit list somebody wrote, so the size of it
 * is a decision already made. Truncating it here would drop the file the
 * reader asked for last.
 *
 * Two calls rather than one, because merge sorts the paths it is handed. The
 * document has to lead, and its own name decides nothing about where it goes.
 */
const merge = (files) =>
  execFileSync(process.execPath, [MERGE, '--force', ...files], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd();

function main() {
  const argv = process.argv.slice(2);
  require('../../lib/command').helpOrRun(__filename, argv);
  const filesOnly = argv.includes('--files-only');
  const [target] = argv.filter((a) => !a.startsWith('--'));
  if (!target) {
    process.stderr.write('Usage: util fs open [--files-only] <file>\n');
    process.exit(1);
  }

  const abs = path.resolve(process.cwd(), target);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`No file at ${target}\n`);
    process.exit(1);
  }

  const rel = path.relative(process.cwd(), abs) || target;
  const specs = readBlock(fs.readFileSync(abs, 'utf8'));
  const bases = [path.dirname(abs), process.cwd()];
  const found = [];
  const missing = [];
  for (const spec of specs) {
    const hit = resolve(spec, bases);
    if (!hit) missing.push(spec);
    // A block naming its own document prints it once, at the front, like any
    // other run.
    else if (hit !== abs) found.push(hit);
  }

  const parts = [];
  if (!filesOnly) parts.push(merge([abs]));
  if (found.length) parts.push(merge(found));
  const body = parts.join('\n\n');

  const count = `${found.length} file${found.length === 1 ? '' : 's'}`;
  const head = specs.length
    ? (filesOnly ? count : `${rel} and ${count}`)
    : (filesOnly ? `no block in ${rel}` : `${rel}, no open block`);
  const size = body ? `, ${body.split('\n').length} lines` : '';
  process.stdout.write(`open: ${head}${size}\n`);
  if (missing.length) process.stdout.write(`missing: ${missing.join(', ')}\n`);
  if (body) process.stdout.write(`\n${body}\n`);
}

main();
