#!/usr/bin/env bash
# description: save a repository's stars, language and last push date, as a line or a file
#
# util github bookmark: save a GitHub repository as a line in a file, or as a file.
#
#   util github bookmark <repo>... [--to <file-or-folder>]
#
#   <repo>      owner/repo, an https URL, a git@ remote, or a link into a
#               repository
#   --to        the file to add to (inbox.md here by default, or
#               $UTIL_BOOKMARKS), or a folder to write one file per repository
#               into. A folder is a path that exists as one, or ends in /
#
# Given a file, each repository becomes one markdown list item, added to the
# end of it:
#
#   - [owner/repo](url) (`28.2k★` · `TypeScript` · pushed 2026-07-30): description
#
# A repository whose link is already in the file is skipped.
#
# Given a folder, each repository becomes owner_repo.md inside it. GitHub owner
# names never hold a _, so the first one marks where the owner ends:
#
#   ---
#   description: "The Memory Layer for AI Agents"
#   type: ""
#   url: https://github.com/mem0ai/mem0
#   stars: 64.7k
#   language: Python
#   pushed: 2026-09-03
#   ---
#
#   ## Notes
#
# type is left empty for you to fill in: GitHub never says whether a repository
# is a skill, a plugin or a library. An archived repository gets archived: true.
# A repository is skipped when a file of that name already exists anywhere in
# the git repository holding the folder, so a file moved to another folder
# still counts.
#
# What was written is printed, the line or the file's path, so you can see it
# when it does not land where you expected.
#
# Needs the `gh` command, logged in. A relative path is read from the folder
# you are standing in, so bookmarking from two projects fills two places.

set -uo pipefail

me="util github bookmark"

usage() {
  awk 'NR == 1 { next }
       /^#/ {
         sub(/^# ?/, "")
         if ($0 ~ /^description:/ && !seen) next
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
      [ $# -ge 2 ] || { echo "$me: --to needs a file or a folder" >&2; exit 64; }
      target="$2"; shift 2 ;;
    -*) echo "$me: unknown flag \"$1\"" >&2; exit 64 ;;
    *) repos+=("$1"); shift ;;
  esac
done

if [ ${#repos[@]} -eq 0 ]; then
  echo "$me: name at least one repo" >&2
  echo "  $me <owner/repo>... [--to <file-or-folder>]" >&2
  exit 64
fi

command -v gh >/dev/null 2>&1 || {
  echo "$me: needs the gh CLI: https://cli.github.com" >&2
  exit 1
}

folder=0
case "$target" in
  */) folder=1 ;;
  *) [ -d "$target" ] && folder=1 ;;
esac

if [ "$folder" -eq 1 ]; then
  mkdir -p "$target" || exit 1
  target="${target%/}"
  # The whole repository is searched, not the folder, because filing a
  # bookmark means moving its file somewhere else in the same repository.
  root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null) || root="$target"
fi

failed=0

for raw in "${repos[@]}"; do
  slug=$(printf '%s' "$raw" \
    | sed -E 's#^git@github\.com:#https://github.com/#; s#^https?://(www\.)?github\.com/##; s#\.git/?$##' \
    | cut -d/ -f1,2)

  case "$slug" in
    */*) ;;
    *) echo "$me: not a repo \"$raw\"" >&2; failed=1; continue ;;
  esac

  # One field per line, in a fixed order. Whitespace inside the description is
  # folded first, so no field can run onto a second line.
  #
  # Stars round to one decimal below 100k and to whole thousands above it, so
  # the column stays the same width whatever the repo.
  fetched=$(gh api "repos/$slug" --jq '
    def stars:
      if . >= 100000 then "\(. / 1000 | floor)k"
      elif . >= 1000 then ((. / 100 | round / 10 | tostring) | sub("\\.0$"; "")) + "k"
      else tostring end;

    .full_name, .html_url, (.stargazers_count | stars), (.language // ""),
    (.pushed_at | split("T")[0]), (.archived | tostring),
    ((.description // "") | gsub("\\s+"; " ") | sub("^ "; "") | sub(" $"; ""))
  ') || { echo "$me: failed on $slug" >&2; failed=1; continue; }

  mapfile -t field <<< "$fetched"
  name="${field[0]}" url="${field[1]}" stars="${field[2]}" language="${field[3]:-}"
  pushed="${field[4]}" archived="${field[5]}" desc="${field[6]:-}"

  if [ "$folder" -eq 0 ]; then
    if [ -f "$target" ] && grep -qiF "]($url)" "$target"; then
      echo "$me: $name is already in $target, skipped" >&2
      continue
    fi

    meta="\`$stars★\`"
    [ -n "$language" ] && meta="$meta · \`$language\`"
    meta="$meta · pushed $pushed"
    [ "$archived" = true ] && meta="$meta · \`⚠ archived\`"
    line="- [$name]($url) ($meta): ${desc:-no description}"

    printf '%s\n' "$line" >> "$target" || { failed=1; continue; }
    printf '%s\n' "$line"
    continue
  fi

  file="${name/\//_}.md"
  existing=$(find "$root" -name .git -prune -o -name node_modules -prune -o \
    -type f -iname "$file" -print -quit)
  if [ -n "$existing" ]; then
    echo "$me: $name is already at $existing, skipped" >&2
    continue
  fi

  # Double quotes keep a colon in GitHub's text from breaking the fields, so
  # the two characters that end or escape a quoted value are escaped.
  quoted=${desc//\\/\\\\}
  quoted=${quoted//\"/\\\"}

  {
    printf -- '---\n'
    printf 'description: "%s"\n' "$quoted"
    printf 'type: ""\n'
    printf 'url: %s\n' "$url"
    printf 'stars: %s\n' "$stars"
    printf 'language: %s\n' "${language:-\"\"}"
    printf 'pushed: %s\n' "$pushed"
    [ "$archived" = true ] && printf 'archived: true\n'
    printf -- '---\n\n## Notes\n'
  } > "$target/$file" || { failed=1; continue; }
  printf '%s\n' "$target/$file"
done

exit "$failed"
