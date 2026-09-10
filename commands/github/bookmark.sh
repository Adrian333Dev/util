#!/usr/bin/env bash
# description: append a repo's stars, language and pushed date to a file
#
# Usage: util github bookmark <repo>... [--to <file>]
#
#   <repo>      owner/repo, an https URL, a git@ remote, or a deep link
#   --to <file> the file to append to (default: inbox.md here, or $UTIL_BOOKMARKS)
#
# Writes one markdown list item per repo:
#
#   - [name](url) (`28.2k★` · `TypeScript` · pushed 2026-07-30): description
#
# The line is printed as well as appended, so piping it somewhere else works
# and the append is visible when it does not.
#
# Needs the `gh` CLI, authenticated. Was `bin/add-repo` in the toolbox repo,
# where the target file resolved against that one repo's root; here it resolves
# against the directory you are standing in.

set -uo pipefail

me="util github bookmark"

usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"
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
