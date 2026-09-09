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
const { COMMENT } = require('./describe');

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

/**
 * The file's own header, minus the shebang and the `description:` line, which
 * is an index entry for `util ls` rather than documentation.
 */
function usage(file) {
  const raw = headerLines(fs.readFileSync(file, 'utf8'));
  return raw
    .map((l) => l.replace(COMMENT, '').replace(/\*\/\s*$/, '').trimEnd())
    .filter((l) => !l.trim().startsWith('description:'))
    .join('\n')
    .trim();
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

module.exports = { usage, wantsHelp, helpOrRun };
