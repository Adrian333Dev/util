#!/usr/bin/env node
/**
 * description: print many files as one text, not designed for Claude Code
 *
 * util fs merge: print many files as one text, ready to paste into a chat.
 *
 *   util fs merge src README.md            every file in a folder, and one file
 *   util fs merge src/parser.js:45-89      only lines 45 to 89 of a file
 *   util fs merge src --ext ts,tsx         only files with these extensions
 *   util fs merge src --except "*.test.*"  leave out files matching a glob
 *   util fs merge src --force              print even when it runs past the limit
 *
 * Each file arrives inside a code block labelled with its path, counted from
 * the folder you ran the command in. Every line carries its line number in the
 * file, so the next read can name a range. Repeated blank lines collapse to
 * one, and the numbers still count them.
 * --ext and --except can each be given more than once, and a `--` ends the
 * paths, so anything you type after it is ignored.
 *
 * Past 2000 lines nothing is printed. What prints instead is the line count of
 * each file, so you can see which one is large and name narrower paths.
 * --force prints the lot anyway.
 */

const fs = require('fs');
const path = require('path');

const ME = 'util fs merge';
const USAGE = `${ME} [--ext ts,tsx] [--except pattern] [--force] <path1[:N-M]> [path2] ... [-- note]`;

const die = (message) => {
  process.stderr.write(`${ME}: ${message}\n  usage: ${USAGE}\n`);
  process.exit(1);
};

const LINE_LIMIT = 2000;

const DEFAULT_EXCLUDE_SEGMENTS = new Set([
  '.git', 'node_modules', 'dist', '.turbo', '__pycache__',
  'temp', 'tmp', '.tmp', '.temp', '.venv', 'vendor',
]);

const ASSET_EXTENSIONS = new Set([
  '.gif', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.bmp', '.tiff',
  '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
]);

const EXCLUDED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

function matchesGlob(relPath, pattern) {
  const p = pattern.trim();
  if (!p) return false;
  if (!p.includes('*')) {
    // exact path match, or any path segment (catches both basenames and folder names)
    return relPath === p || relPath.split('/').includes(p);
  }
  const reStr = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\x00/g, '.*');
  return new RegExp('^' + reStr + '$').test(relPath);
}

function walkDir(dirPath, dirRel, seen, result) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const e of entries) {
    const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!DEFAULT_EXCLUDE_SEGMENTS.has(e.name)) walkDir(path.join(dirPath, e.name), rel, seen, result);
    } else if (e.isFile() && !seen.has(rel)) {
      seen.add(rel);
      result.push(rel);
    }
  }
}

function collectFiles(pathArgs) {
  const cwd = process.cwd();
  const seen = new Set();
  const result = [];
  for (const arg of pathArgs) {
    const resolved = path.resolve(cwd, arg);
    if (!fs.existsSync(resolved)) {
      process.stderr.write(`${ME}: skipping ${arg}, which does not exist\n`);
      continue;
    }
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      const rel = path.relative(cwd, resolved).replace(/\\/g, '/');
      if (!seen.has(rel)) { seen.add(rel); result.push(rel); }
    } else if (stat.isDirectory()) {
      const dirRel = path.relative(cwd, resolved).replace(/\\/g, '/');
      walkDir(resolved, dirRel, seen, result);
    }
  }
  return result.sort();
}

function applyFilters(files, extList, exceptPatterns) {
  return files.filter((rel) => {
    if (EXCLUDED_BASENAMES.has(path.basename(rel))) return false;
    const ext = path.extname(rel).toLowerCase();
    if (ASSET_EXTENSIONS.has(ext)) return false;
    if (extList.length > 0 && !extList.includes(ext)) return false;
    if (exceptPatterns.some((p) => matchesGlob(rel, p))) return false;
    return true;
  });
}

/**
 * Each line prefixed with its number in the file, the way Read prints one.
 *
 * Numbered before blank lines collapse, so a number always names the line it
 * sits on in the file. A collapsed run shows as a jump in the numbers.
 */
function numberLines(content, first) {
  const lines = content.split('\n');
  const width = String(first + lines.length - 1).length;
  const out = [];
  lines.forEach((line, i) => {
    const blank = !line.trim();
    if (blank && i > 0 && !lines[i - 1].trim()) return;
    const n = String(first + i).padStart(width);
    out.push(blank ? n : `${n}\t${line}`);
  });
  return out.join('\n');
}

function countLines(str) {
  return str.split('\n').length;
}

/** Returns { filePath, start, end } if arg has :N-M suffix, else null. */
function parseLineRange(arg) {
  const m = arg.match(/^(.+):(\d+)-(\d+)$/);
  if (!m) return null;
  return { filePath: m[1], start: parseInt(m[2], 10), end: parseInt(m[3], 10) };
}

function parseArgs() {
  const args = process.argv.slice(2);
  require('../../lib/command').helpOrRun(__filename, args);
  const pathArgs = [];
  const rangedSpecs = []; // { filePath, start, end }
  const extList = [];
  const exceptPatterns = [];
  let force = false;

  // A flag missing its value used to fall through both branches and vanish,
  // and an unknown one still does nothing. Either way the merge ran and exited
  // 0 over the wrong set of files, which reads exactly like the right one.
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      break; // everything after is prose for the model, never a path
    } else if (arg === '--ext') {
      const value = args[++i];
      if (value === undefined) die('--ext wants extensions, comma separated, like ts,tsx,md.');
      extList.push(...value.split(',').map((e) => {
        const t = e.trim();
        return t.startsWith('.') ? t : '.' + t;
      }).filter(Boolean));
    } else if (arg === '--except') {
      const value = args[++i];
      if (value === undefined) die('--except wants a glob.');
      exceptPatterns.push(value);
    } else if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--')) {
      die(`unknown flag "${arg}".`);
    } else {
      const range = parseLineRange(arg);
      if (range) {
        rangedSpecs.push(range);
      } else {
        pathArgs.push(arg);
      }
    }
  }

  return { pathArgs, rangedSpecs, extList, exceptPatterns, force };
}

/**
 * One file as a fenced block, labelled with its path.
 *
 * Three backticks, whatever the file holds. A number opens every line, so a
 * fence inside a markdown file never starts a line and never closes the block
 * early.
 *
 * No language on the opener. The path ends in the extension, so a reader and a
 * model both already know what the file is, and the word costs a repetition on
 * every file in the stream.
 */
function buildEntry(rel, raw, range) {
  const label = range ? `${rel}:${range.start}-${range.end}` : rel;
  const content = numberLines(raw.trimEnd(), range ? range.start : 1);
  return { rel, block: `\`\`\` ${label}\n${content}\n\`\`\`` };
}

function main() {
  const { pathArgs, rangedSpecs, extList, exceptPatterns, force } = parseArgs();

  if (pathArgs.length === 0 && rangedSpecs.length === 0) {
    process.stderr.write(`usage: ${USAGE}\n`);
    process.exit(1);
  }

  const entries = [];

  // Regular paths (files + folders)
  if (pathArgs.length > 0) {
    const allFiles = collectFiles(pathArgs);
    const files = applyFilters(allFiles, extList, exceptPatterns);
    for (const rel of files) {
      const raw = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      entries.push(buildEntry(rel, raw, null));
    }
  }

  // Ranged paths: line slice only, filters not applied (explicit inclusion)
  for (const { filePath, start, end } of rangedSpecs) {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      process.stderr.write(`${ME}: skipping ${filePath}, which does not exist\n`);
      continue;
    }
    const rel = path.relative(process.cwd(), resolved).replace(/\\/g, '/');
    const allLines = fs.readFileSync(resolved, 'utf8').split('\n');
    const sliced = allLines.slice(start - 1, end).join('\n'); // 1-indexed, inclusive
    entries.push(buildEntry(rel, sliced, { start, end }));
  }

  if (entries.length === 0) {
    process.stdout.write(`${ME}: no file left to print.\n`);
    return;
  }

  const totalLines = entries.reduce((sum, e) => sum + countLines(e.block), 0);

  if (totalLines > LINE_LIMIT && !force) {
    const lines = [
      `${ME}: ${totalLines} lines is past the ${LINE_LIMIT}-line limit, so nothing was printed.`,
      '  Narrow the paths, or pass --force to print it anyway.\n',
      'Lines per file:',
    ];
    for (const e of entries) {
      const lc = countLines(e.block);
      lines.push(`  ${String(lc).padStart(5)} lines  ${e.rel}`);
    }
    lines.push(`\n  Total: ${totalLines} lines`);
    process.stdout.write(lines.join('\n') + '\n');
    return;
  }

  process.stdout.write(entries.map((e) => e.block).join('\n\n') + '\n');
}

main();
