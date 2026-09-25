#!/usr/bin/env bash
# util github clone: clone one or more repositories from GitHub.
#
#   util github clone <repo>... [--into <dir>]
#
#   <repo>        owner/repo, an https URL, a git@ remote, or a link to a file
#                 or a branch inside a repository. All four name the same
#                 repository, so paste whatever you have
#   --into <dir>  clone into this folder instead of the one you are in
#
# A repository already on disk is named and skipped, so adding one name to a
# line you have run before clones only the one that is missing. The exit
# status is non-zero when any clone failed, and the ones that worked stand.

set -uo pipefail

me="util github clone"

usage() {
  awk 'NR == 1 { next }
       /^#/ {
         sub(/^# ?/, "")
         if ($0 == "" && !seen) next
         seen = 1
         print
         next
       }
       { exit }' "${BASH_SOURCE[0]}"
}

into="."
repos=()

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --into)
      [ $# -ge 2 ] || { echo "$me: --into needs a directory" >&2; exit 64; }
      into="$2"; shift 2 ;;
    -*) echo "$me: unknown flag \"$1\"" >&2; exit 64 ;;
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
    *) echo "$me: not a repo \"$raw\"" >&2; failed=1; continue ;;
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
    echo "$me: failed on $slug" >&2
    failed=1
  fi
done

exit "$failed"
