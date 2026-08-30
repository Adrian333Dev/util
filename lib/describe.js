'use strict';
/**
 * The `description:` line — one index entry per command, read off the file.
 *
 * A command is an executable in any language, so the marker is looked for
 * inside a comment in whatever syntax that language uses: `#`, `//`, `--`, `;`
 * and the rest. Only a comment line is scanned, which is what keeps a SQL
 * column named `description` out of the results.
 *
 * A description is an index entry, never the file's documentation. The header
 * comment explaining what a command does stays as long as it needs to be; this
 * is the one line printed beside the name in `util ls`.
 *
 * `ptree.js` in the Flow clone carries the same reader today. It moves in here
 * as `fs tree`, and this becomes the one copy.
 */

const fs = require('fs');
const path = require('path');

const CAP = 120;        // characters shown before the ellipsis
const WINDOW = 50;      // lines of head scanned for the marker
const HEAD_BYTES = 8192; // read per file, whatever its size

const COMMENT = /^\s*(\/\/+|#+|\/\*+|\*+|<!--+|--+|;+|%+)\s?/;

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
 */
function clip(text) {
  const one = text.replace(/\s+/g, ' ').trim();
  const stop = one.search(/[.!?](\s|$)/);
  const sentence = stop === -1 ? one : one.slice(0, stop);
  return sentence.length > CAP ? sentence.slice(0, CAP - 1).trimEnd() + '…' : sentence;
}

/**
 * A command's description, or null.
 *
 * The marker's paragraph continues onto the following comment lines and stops
 * at the first blank comment line, the end of the block, or a line that is no
 * longer a comment. A later paragraph is about something else.
 */
function describeFile(file) {
  const lines = head(file);
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
    return clip(parts.join(' '));
  }
  return null;
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

module.exports = { CAP, describeFile, readInfo };
