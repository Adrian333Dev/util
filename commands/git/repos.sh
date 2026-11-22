#!/usr/bin/env bash
# util git repos: list, record and clone the git repos nested inside this one.
#
#   util git repos           list them: path, mine or others', changed or not, URL
#   util git repos write     write `.repos` at this repo's root (`util git save` does it on each save)
#   util git repos clone     clone each repo `.repos` lists that is missing, then the same inside each
#   util git repos mine      only the paths of mine, one per line (`util git save -a` reads it)
#
# A nested repo is a folder with its own `.git` folder anywhere under this repo's root, the
# nearest one only: a repo inside a nested repo is in that repo's own `.repos`. Skipped: folders
# named node_modules, .venv, tmp, temp or downloads (scratch and copies fetched again when needed),
# and `.git` files (worktrees, submodules). Mine: its origin has the same owner as this repo's.
#
# `.repos` holds one line per nested repo, `<path> <url>`, sorted. A repo with no origin is named
# on stderr and left out, since nothing could clone it. With no nested repo, no file.

set -euo pipefail

me="util git repos"
usage() {
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
}

action=list
case "${1:-}" in
  ""|list) ;;
  write|clone|mine) action=$1 ;;
  -h|--help) usage; exit 0 ;;
  *) echo "$me: unknown action \"$1\" (try $me --help)" >&2; exit 1 ;;
esac

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "$me: not inside a git repository." >&2; exit 1; }
cd "$root"

# The owner of a remote: its URL without the repo's own name, so https://github.com/<owner>/x,
# git@github.com:<owner>/x and a folder of bare repos all compare by what holds the repo.
owner_of() {
  printf '%s' "$1" | sed -E 's#^[a-z+]+://##; s#^[^@/]*@##; s#^([^/:]+):#\1/#; s#/+$##; s#/[^/]*$##'
}

# The nearest nested repos, one path per line, relative and sorted.
nested() {
  find . \( -path ./.git -o -name node_modules -o -name .venv -o -name tmp -o -name temp -o -name downloads \) -prune \
    -o -name .git -type d -print -prune 2>/dev/null \
    | sed 's#^\./##; s#/\.git$##' | sort \
    | awk 'NR == 1 || index($0, last "/") != 1 { print; last = $0 }'
}

case "$action" in
  list)
    mine=$(owner_of "$(git remote get-url origin 2>/dev/null || true)")
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      url=$(git -C "$p" remote get-url origin 2>/dev/null || true)
      who=others; [ -n "$url" ] && [ "$(owner_of "$url")" = "$mine" ] && who=mine
      state=clean; [ -z "$(git -C "$p" status --porcelain 2>/dev/null | head -1)" ] || state=changed
      printf '%-48s %-6s %-7s %s\n' "$p" "$who" "$state" "${url:-(no origin)}"
    done < <(nested)
    ;;

  mine)
    mine=$(owner_of "$(git remote get-url origin 2>/dev/null || true)")
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      url=$(git -C "$p" remote get-url origin 2>/dev/null) || continue
      [ "$(owner_of "$url")" = "$mine" ] && printf '%s\n' "$p" || true
    done < <(nested)
    ;;

  write)
    lines=""
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      if url=$(git -C "$p" remote get-url origin 2>/dev/null); then lines+="$p $url"$'\n'
      else echo "$me: $p has no origin, so .repos leaves it out" >&2; fi
    done < <(nested)
    if [ -z "$lines" ]; then
      rm -f .repos
    else
      new="# The git repos nested here, written by \`util git save\`. \`util git repos clone\` clones the missing ones."$'\n'"$lines"
      [ -f .repos ] && [ "$(cat .repos)"$'\n' = "$new" ] || printf '%s' "$new" > .repos
    fi
    ;;

  clone)
    [ -f .repos ] || { echo "$me: no .repos in $root"; exit 0; }
    failed=0
    while read -r p url; do
      case "$p" in ""|"#"*) continue ;; esac
      if [ -e "$p/.git" ]; then
        :
      elif [ -e "$p" ] && [ -n "$(ls -A "$p" 2>/dev/null)" ]; then
        echo "$me: $p exists and is not a repo, skipped" >&2; failed=1; continue
      else
        mkdir -p "$(dirname "$p")"
        echo "cloning $p"
        git clone -q "$url" "$p" || { echo "$me: clone of $url failed" >&2; failed=1; continue; }
      fi
      (cd "$p" && "$0" clone) || failed=1
    done < .repos
    exit "$failed"
    ;;
esac
