'use strict';
/**
 * "did you mean", for a word that resolved to nothing.
 *
 * `util unistall` is one keystroke away from `util uninstall`, and a list of
 * every namespace does not help you see which keystroke. This counts the
 * single character edits between what you typed and each name that exists,
 * and names the closest one.
 *
 * Nothing is suggested unless one name wins outright. Two names equally close
 * is a guess, and a wrong guess sends you looking in the wrong place. The one
 * tie that resolves is a namespace against its own alias, since `g` and `git`
 * are two spellings of one place.
 */

/** Two edits: far enough to catch a typo, near enough not to invent a match. */
const LIMIT = 2;

/**
 * How many single character edits turn one word into the other: an insertion,
 * a deletion, a substitution, or two neighbours swapped.
 *
 * The swap is why `gti` finds `git` rather than tying with `g` and `gh`.
 * Counting it as two edits, which plain Levenshtein does, makes the commonest
 * typing mistake the one the suggestion is worst at. Two rows of the matrix
 * are kept, since a swap looks back at the row before last.
 */
function distance(a, b) {
  let twoAgo = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], twoAgo[j - 2] + 1);
      }
    }
    twoAgo = previous;
    previous = row;
  }
  return previous[b.length];
}

/**
 * The one name within two edits, or null when none or several qualify.
 *
 * `names` maps a candidate to the thing it names, so a namespace and its alias
 * count as one candidate and answer with the full name. Everything else names
 * itself.
 */
function nearest(typed, candidates, names = (name) => name) {
  const word = typed.toLowerCase();
  let best = null;
  let bestAt = LIMIT + 1;
  let tied = false;
  for (const name of new Set(candidates)) {
    const at = distance(word, name.toLowerCase());
    if (at < bestAt) {
      best = names(name);
      bestAt = at;
      tied = false;
    } else if (at === bestAt && names(name) !== best) {
      tied = true;
    }
  }
  return tied ? null : best;
}

module.exports = { nearest, distance };
