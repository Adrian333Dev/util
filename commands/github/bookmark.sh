#!/usr/bin/env bash
# description: add a repository's stars, language and last push date to a file
#
# util github bookmark: save a GitHub repository to a file, as one line.
#
#   util github bookmark <repo>... [--to <file>]
#
#   <repo>      owner/repo, an https URL, a git@ remote, or a link into a
#               repository
#   --to <file> the file to add to (inbox.md here by default, or $UTIL_BOOKMARKS)
#
# Each repository becomes one markdown list item, added to the end of the file:
#
#   - [name](url) (`28.2k★` · `TypeScript` · pushed 2026-07-30): description
#
# The line is printed as well as saved, so piping it somewhere else works, and
# you can see what was written when it does not.
#
# Needs the `gh` command, logged in. The file is found from the folder you are
# standing in, so bookmarking from two projects fills two different files.

set -uo pipefail

me="util github bookmark"

usage() {
  awk 'NR == 1 { next }
       /^#/ {
         sub(/^# ?/, "")
         if ($0 ~ /^description:/) next
         if ($0 == "" && !seen) next
         seen = 1
         print
         next
       }
       { exit }' "${BASH_SOURCE[0]}"
}

target="${UTIL_BOOKMARKS:-inbox.md}"
repos=()

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --to)
      [ $# -ge 2 ] || { echo "$me: --to needs a file" >&2; exit 64; }
      target="$2"; shift 2 ;;
    -*) echo "$me: unknown flag \"$1\"" >&2; exit 64 ;;
    *) repos+=("$1"); shift ;;
  esac
done

if [ ${#repos[@]} -eq 0 ]; then
  echo "$me: name at least one repo" >&2
  echo "  $me <owner/repo>... [--to <file>]" >&2
  exit 64
fi

command -v gh >/dev/null 2>&1 || {
  echo "$me: needs the gh CLI: https://cli.github.com" >&2
  exit 1
}

failed=0

for raw in "${repos[@]}"; do
  slug=$(printf '%s' "$raw" \
    | sed -E 's#^git@github\.com:#https://github.com/#; s#^https?://(www\.)?github\.com/##; s#\.git/?$##' \
    | cut -d/ -f1,2)

  case "$slug" in
    */*) ;;
    *) echo "$me: not a repo \"$raw\"" >&2; failed=1; continue ;;
  esac

  # Stars round to one decimal below 100k and to whole thousands above it, so
  # the column stays the same width whatever the repo.
  line=$(gh api "repos/$slug" --jq '
    def stars:
      if . >= 100000 then "\(. / 1000 | floor)k"
      elif . >= 1000 then ((. / 100 | round / 10 | tostring) | sub("\\.0$"; "")) + "k"
      else tostring end;

    ( [ "`" + (.stargazers_count | stars) + "★`",
        (if .language then "`" + .language + "`" else empty end),
        "pushed " + (.pushed_at | split("T")[0]),
        (if .archived then "`⚠ archived`" else empty end)
      ] | join(" · ") ) as $meta
    | ( (.description // "no description") | gsub("\\s+"; " ") ) as $desc
    | "- [\(.name)](\(.html_url)) (\($meta)): \($desc)"
  ') || { echo "$me: failed on $slug" >&2; failed=1; continue; }

  printf '%s\n' "$line" >> "$target" || { failed=1; continue; }
  printf '%s\n' "$line"
done

exit "$failed"
