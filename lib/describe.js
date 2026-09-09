'use strict';
/**
 * The `description:` line — one index entry per file, read off the file.
 *
 * Two readers use this. `util ls` prints a line beside each command, and
 * `util fs tree` prints one beside each entry in a directory tree. They read
 * the same marker in the same places, so there is one copy of the rules.
 *
 * A file is in any language, so the marker is looked for inside a comment in
 * whatever syntax that language uses: `#`, `//`, `--`, `;` and the rest. Only a
 * comment line is scanned, which is what keeps a SQL column named
 * `description` out of the results. Markdown is the exception: frontmatter
 * carries no comment syntax, and `description` is the key Claude Code already
 * requires in a skill's frontmatter.
 *
 * A description is an index entry, never the file's documentation. The header
 * comment explaining what a file does stays as long as it needs to be; this is
 * the one line that fits in a list. A few words beat a sentence: a listing puts
 * dozens of these in front of a reader at once.
 */

const fs = require('fs');
const path = require('path');

const CAP = 120;        // characters shown before the ellipsis
const WINDOW = 50;      // lines of head scanned for the marker
const HEAD_BYTES = 8192; // read per file, whatever its size

const COMMENT = /^\s*(\/\/+|#+|\/\*+|\*+|<!--+|--+|;+|%+)\s?/;
const BINARY = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|tgz|mp4|mp3|wav|woff2?|ttf|eot|lock)$/i;

/** The first WINDOW lines, without reading a large file whole. */
function head(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).toString('utf8').split('\n').slice(0, WINDOW);
  } catch {
    return [];
  }
}

/** Strip the comment punctuation and any block closer, leaving the text. */
const bare = (line) => line.replace(COMMENT, '').replace(/(-->|\*\/)\s*$/, '').trim();

/**
 * One sentence at most, one line at most. Both bounds always apply, so a
 * runaway comment that happens to open with the marker cannot flood the list.
 * The closing full stop goes with it: these are rows in a list, not prose.
 */
function clip(text) {
  const one = text.replace(/\s+/g, ' ').trim();
  const stop = one.search(/[.!?](\s|$)/);
  const sentence = stop === -1 ? one : one.slice(0, stop);
  return sentence.length > CAP ? sentence.slice(0, CAP - 1).trimEnd() + '…' : sentence;
}

/**
 * The marker inside a comment.
 *
 * The paragraph continues onto the following comment lines and stops at the
 * first blank comment line, the end of the block, or a line that is no longer
 * a comment. A later paragraph is about something else.
 */
function fromComment(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!COMMENT.test(lines[i])) continue;
    const m = /^description:\s*(.+)$/i.exec(bare(lines[i]));
    if (!m) continue;

    const parts = [m[1]];
    for (let j = i + 1; j < lines.length; j++) {
      if (!COMMENT.test(lines[j])) break;
      const t = bare(lines[j]);
      if (!t) break;
      parts.push(t);
    }
    return parts.join(' ');
  }
  return null;
}

/**
 * Markdown lines with every fenced code block dropped.
 *
 * A `#` heading and a `#` comment are one thing to `fromComment`, so a page
 * showing the `description:` convention would otherwise be described by its own
 * example. Every page documenting the convention carries one, this repository's
 * README included, and a section added above it is all it takes to move the
 * example inside the 50-line window.
 */
function outsideFences(lines) {
  let inside = false;
  return lines.filter((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inside = !inside;
      return false;
    }
    return !inside;
  });
}

/** The `description:` key in markdown frontmatter, folded or literal blocks included. */
function fromFrontmatter(lines) {
  if (lines[0]?.trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return null;
    const m = /^description:\s*(.*)$/i.exec(lines[i]);
    if (!m) continue;

    const value = m[1].trim();
    if (value && !'>-|'.includes(value)) return value;

    const parts = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (!/^\s+\S/.test(lines[j])) break;
      parts.push(lines[j].trim());
    }
    return parts.join(' ');
  }
  return null;
}

/** A file's description, or null. */
function describeFile(file) {
  if (BINARY.test(file)) return null;
  const lines = head(file);
  const raw = file.endsWith('.md')
    ? fromFrontmatter(lines) || fromComment(outsideFences(lines))
    : fromComment(lines);
  return raw ? clip(raw) : null;
}

/**
 * What a folder says about itself, from the `.info` beside its contents.
 *
 * Two fields, and a folder may carry either alone. The description is the
 * first paragraph. An `alias:` line anywhere gives the short name a namespace
 * is also reachable by, and never counts as part of the description, so it can
 * sit at the top or the bottom.
 */
function readInfo(dir) {
  let text;
  try {
    text = fs.readFileSync(path.join(dir, '.info'), 'utf8');
  } catch {
    return { description: null, alias: null };
  }

  let alias = null;
  const kept = [];
  for (const line of text.split('\n')) {
    const m = /^\s*alias:\s*(\S+)\s*$/i.exec(line);
    if (m) {
      alias = alias || m[1];
      continue;
    }
    kept.push(line);
  }

  const first = kept.join('\n').split(/\n\s*\n/).map((p) => p.trim()).find(Boolean);
  return { description: first ? clip(first) : null, alias };
}

/**
 * A folder's description for a tree listing: its `.info`, then its README.
 *
 * The README fallback is why this is not `readInfo`. A folder that already
 * explains itself in a README should not need a second file saying the same
 * thing, and the first real line of one is usually the sentence wanted.
 */
function describeFolder(dir) {
  const { description } = readInfo(dir);
  if (description) return description;

  for (const name of ['README.md', 'readme.md']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const marked = describeFile(file);
    if (marked) return marked;
    const first = outsideFences(head(file))
      .find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
    if (first) return clip(first.replace(/^description:\s*/i, ''));
  }
  return null;
}

module.exports = { CAP, COMMENT, clip, describeFile, describeFolder, readInfo };
