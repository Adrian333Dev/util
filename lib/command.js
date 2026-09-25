'use strict';
/**
 * The help a command prints, read off that command's own header comment.
 *
 * Every command here documents itself in the comment at the top of its file,
 * so `--help` prints that comment back rather than a second copy written
 * somewhere else. Two copies drift, and the one nobody runs is the one that
 * goes stale.
 *
 * Optional, like everything in this folder. `util` runs an executable in any
 * language and never looks at its arguments, so a command in another
 * repository cannot reach this file and is not expected to. This serves the
 * commands shipped beside it.
 */

const fs = require('fs');

/** A comment line in any language: `#`, `//`, `/*`, ` *`, `--`, `;` and the rest. */
const COMMENT = /^\s*(\/\/+|#+|\/\*+|\*+|<!--+|--+|;+|%+)\s?/;
const CAP = 120; // characters of a summary shown before the ellipsis

const HELP_WORDS = ['-h', '--help', 'help'];

/** True when the words typed after the command name ask for its help. */
const wantsHelp = (argv) => argv.some((a) => HELP_WORDS.includes(a));

/** A `/* *\/` block, a run of `//` lines, or a run of `#` lines. */
function headerLines(text) {
  const lines = text.split('\n');
  if (lines[0] && lines[0].startsWith('#!')) lines.shift();
  // A blank line or a `'use strict';` sits above the comment as often as not.
  while (lines.length && (!lines[0].trim() || /^['"]use strict['"];?$/.test(lines[0].trim()))) {
    lines.shift();
  }

  if (lines[0] && lines[0].trim().startsWith('/*')) {
    const end = lines.findIndex((l) => l.includes('*/'));
    return end === -1 ? lines : lines.slice(0, end + 1);
  }
  const end = lines.findIndex((l) => !COMMENT.test(l));
  return end === -1 ? lines : lines.slice(0, end);
}

/** The file's own header, minus the shebang. */
function usage(file) {
  const raw = headerLines(fs.readFileSync(file, 'utf8'));
  return raw
    // The closing `*/` goes first. COMMENT matches a run of stars, so stripping
    // it from ` */` leaves a bare slash behind, and every block-comment header
    // used to end its help on that line.
    .map((l) => l.replace(/\*\/\s*$/, '').replace(COMMENT, '').trimEnd())
    .join('\n')
    .trim();
}

/**
 * The line `util ls` prints beside a command: the first sentence of its header,
 * after the `util fs tree:` a shipped command opens with. Capped at one line,
 * so a header that runs on cannot flood the listing.
 */
function summary(file) {
  let text;
  try {
    text = usage(file);
  } catch {
    return null;
  }
  const first = text.split(/\n\s*\n/)[0].replace(/\s+/g, ' ').replace(/^util [\w -]+:\s*/, '').trim();
  const stop = first.search(/[.!?](\s|$)/);
  const sentence = stop === -1 ? first : first.slice(0, stop);
  if (!sentence) return null;
  return sentence.length > CAP ? sentence.slice(0, CAP - 1).trimEnd() + '…' : sentence;
}

/**
 * Print the help and stop, when the arguments asked for it. Every command
 * calls this before it parses anything, so `--help` never reaches code that
 * would rather do the job.
 */
function helpOrRun(file, argv) {
  if (!wantsHelp(argv)) return;
  process.stdout.write(`${usage(file)}\n`);
  process.exit(0);
}

module.exports = { usage, summary, wantsHelp, helpOrRun };
