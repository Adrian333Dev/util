#!/usr/bin/env bash
# description: clone one or more repos from any URL form
#
# Usage: util github clone <repo>... [--into <dir>]
#
#   <repo>        owner/repo, an https URL, a git@ remote, or a deep link into
#                 a file or a branch — all four reduce to the same slug
#   --into <dir>  clone into this directory instead of the current one
#
# A repo already on disk is reported and skipped, so re-running the same line
# after adding one name to it costs nothing and clones only what is missing.
# The exit status is non-zero when any clone failed, and the ones that worked
# still stand.

set -uo pipefail

me="util github clone"

usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
}

into="."
repos=()

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --into)
      [ $# -ge 2 ] || { echo "$me: --into needs a directory" >&2; exit 64; }
      into="$2"; shift 2 ;;
    -*) echo "$me: unknown flag — $1" >&2; exit 64 ;;
    *) repos+=("$1"); shift ;;
  esac
done

if [ ${#repos[@]} -eq 0 ]; then
  echo "$me: name at least one repo" >&2
  echo "  $me <owner/repo>... [--into <dir>]" >&2
  exit 64
fi

mkdir -p "$into" || exit 1

# Every accepted form is the same two path segments once the wrapper is peeled
# off, so a deep link into a file works exactly like a bare owner/repo.
slug_of() {
  printf '%s' "$1" \
    | sed -E 's#^git@github\.com:#https://github.com/#; s#^https?://(www\.)?github\.com/##; s#\.git/?$##' \
    | cut -d/ -f1,2
}

failed=0

for raw in "${repos[@]}"; do
  slug=$(slug_of "$raw")
  case "$slug" in
    */*) ;;
    *) echo "$me: not a repo — $raw" >&2; failed=1; continue ;;
  esac

  name="${slug#*/}"
  dest="$into/$name"

  if [ -e "$dest" ]; then
    echo "have: $name"
    continue
  fi

  if git clone --quiet "https://github.com/$slug" "$dest"; then
    echo "cloned: $slug → $dest"
  else
    echo "$me: failed — $slug" >&2
    failed=1
  fi
done

exit "$failed"
