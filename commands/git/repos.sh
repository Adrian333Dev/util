#!/usr/bin/env bash
# util git repos: list, clone, record and restore the git repos nested inside this one.
#
#   util repos                     short for `util git repos`, and so are all the forms below
#   util git repos                 list them: path, mine or others', clean, changed or missing, URL.
#                                  A repo on disk that `.repos` doesn't list is marked, and so is a
#                                  listed URL that differs from the repo's origin
#   util git repos clone <repo>... [--into <dir>]
#                                  clone from GitHub into this folder (or <dir>) and record each in the
#                                  `.repos` of the repo holding it. <repo>: owner/repo, an https URL, a
#                                  git@ remote or a link to a file or branch inside one. One already on
#                                  disk is named and recorded, not cloned again. Outside a repo: only cloned
#   util git repos add <path>...   record each in `.repos` (a repo moved in, or cloned by hand). Again: URL updated
#   util git repos drop <path>...  take each out of `.repos`
#   util git repos restore         clone each repo `.repos` lists that is missing, then the same inside each
#   util git repos mine            only the paths of mine on disk, one per line (`util git save -a` reads it)
#   util git repos paths           every nested repo on disk, one per line
#
# A nested repo is a folder with its own `.git` folder anywhere under this repo's root, the
# nearest one only: a repo inside a nested repo is in that repo's own `.repos`. Skipped: folders
# named node_modules, .venv, tmp, temp or downloads (scratch and copies fetched again when needed),
# and `.git` files (worktrees, submodules). Mine: its origin has the same owner as this repo's.
#
# `.repos`, at the root of the repo holding them, has one line per nested repo, `<path> <url>`,
# sorted. Only `clone`, `add` and `drop` write it; commit it like any other file. A repo with no
# origin can't be added, since nothing could restore it. Any failure makes the exit status
# non-zero, and what worked stands.

set -euo pipefail

me="util git repos"
usage() {
  awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
}

action=list
case "${1:-}" in
  ""|list) ;;
  add|drop) action=$1; shift; [ $# -gt 0 ] || { echo "$me $action: name at least one path" >&2; exit 64; } ;;
  clone) action=clone; shift ;;
  restore|mine|paths) action=$1 ;;
  -h|--help) usage; exit 0 ;;
  *) echo "$me: unknown action \"$1\" (try $me --help)" >&2; exit 1 ;;
esac

header="# The git repos nested here, one \`<path> <url>\` each. \`util repos restore\` clones the missing ones; \`util repos add\` records one."

# The owner of a remote: its URL without the repo's own name, so https://github.com/<owner>/x,
# git@github.com:<owner>/x and a folder of bare repos all compare by what holds the repo.
owner_of() {
  printf '%s' "$1" | sed -E 's#^[a-z+]+://##; s#^[^@/]*@##; s#^([^/:]+):#\1/#; s#/+$##; s#/[^/]*$##'
}

# The origin URL of repo $1 as written, before any `url.*.insteadOf` rewrite.
origin_of() { git -C "$1" config --get remote.origin.url; }

# The nearest nested repos, one path per line, relative and sorted.
nested() {
  find . \( -path ./.git -o -name node_modules -o -name .venv -o -name tmp -o -name temp -o -name downloads \) -prune \
    -o -name .git -type d -print -prune 2>/dev/null \
    | sed 's#^\./##; s#/\.git$##' | sort \
    | awk 'NR == 1 || index($0, last "/") != 1 { print; last = $0 }'
}

# The `<path> <url>` lines of the .repos in folder $1, comments and blanks left out.
listed() {
  [ -f "$1/.repos" ] || return 0
  awk '!/^#/ && NF >= 2 { print $1, $2 }' "$1/.repos"
}

# Writes the .repos in folder $1 from the `<path> <url>` lines on stdin: sorted, one per path.
# No line left: no file. An unchanged list leaves the file as it is.
write_repos() {
  local lines new
  lines=$(sort -u -k1,1 | awk 'NF')
  if [ -z "$lines" ]; then rm -f "$1/.repos"; return; fi
  new="$header"$'\n'"$lines"$'\n'
  [ -f "$1/.repos" ] && [ "$(cat "$1/.repos")"$'\n' = "$new" ] || printf '%s' "$new" > "$1/.repos"
}

# clone: from GitHub, each one then recorded by `add` when it lands inside a repo.
if [ "$action" = clone ]; then
  into="." repos=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --into) [ $# -ge 2 ] || { echo "$me clone: --into needs a folder" >&2; exit 64; }; into=$2; shift 2 ;;
      -*) echo "$me clone: unknown flag \"$1\"" >&2; exit 64 ;;
      *) repos+=("$1"); shift ;;
    esac
  done
  [ ${#repos[@]} -gt 0 ] || { echo "$me clone: name at least one repo: $me clone <owner/repo>... [--into <folder>]" >&2; exit 64; }
  mkdir -p "$into"
  inside=0; git -C "$into" rev-parse --show-toplevel >/dev/null 2>&1 && inside=1
  failed=0
  for raw in "${repos[@]}"; do
    # Every accepted form is the same two path segments once the wrapper is peeled off.
    slug=$(printf '%s' "$raw" \
      | sed -E 's#^git@github\.com:#https://github.com/#; s#^https?://(www\.)?github\.com/##; s#\.git/?$##' | cut -d/ -f1,2)
    case "$slug" in */?*) ;; *) echo "$me clone: not a repo \"$raw\"" >&2; failed=1; continue ;; esac
    dest="$into/${slug#*/}"
    if [ -e "$dest" ]; then
      echo "have: ${slug#*/}"
    elif git clone --quiet "https://github.com/$slug" "$dest"; then
      echo "cloned: $slug → $dest"
    else
      echo "$me clone: failed on $slug" >&2; failed=1; continue
    fi
    if [ "$inside" = 1 ] && [ -d "$dest/.git" ]; then "$0" add "$dest" || failed=1; fi
  done
  exit "$failed"
fi

# add and drop: each path belongs to the repo holding its parent folder, not the one we stand in.
if [ "$action" = add ] || [ "$action" = drop ]; then
  failed=0
  for arg in "$@"; do
    arg=${arg%/}
    if [ -d "$arg" ]; then
      abs=$(cd "$arg" && pwd -P)
    elif [ "$action" = drop ] && [ -d "$(dirname "$arg")" ]; then
      abs=$(cd "$(dirname "$arg")" && pwd -P)/$(basename "$arg")
    else
      echo "$me $action: no folder $arg" >&2; failed=1; continue
    fi
    root=$(git -C "$(dirname "$abs")" rev-parse --show-toplevel 2>/dev/null) \
      || { echo "$me $action: $arg is inside no git repository" >&2; failed=1; continue; }
    rel=${abs#"$root"/}
    if [ "$action" = drop ]; then
      if ! listed "$root" | awk -v p="$rel" '$1 == p { found = 1 } END { exit !found }'; then
        echo "$me drop: ${root##*/}/.repos doesn't list $rel"; continue
      fi
      listed "$root" | awk -v p="$rel" '$1 != p' | write_repos "$root"
      echo "dropped from ${root##*/}/.repos: $rel"
      continue
    fi
    [ -d "$abs/.git" ] || { echo "$me add: $arg is not a git repo (no .git folder)" >&2; failed=1; continue; }
    url=$(origin_of "$abs") \
      || { echo "$me add: $arg has no origin, so nothing could clone it; set one first" >&2; failed=1; continue; }
    { listed "$root" | awk -v p="$rel" '$1 != p'; echo "$rel $url"; } | write_repos "$root"
    echo "in ${root##*/}/.repos: $rel $url"
    git -C "$root" check-ignore -q "$rel" \
      || echo "  note: ${root##*/} doesn't ignore $rel, so git status shows it untracked; add /$rel/ to its .gitignore" >&2
  done
  exit "$failed"
fi

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "$me: not inside a git repository." >&2; exit 1; }
cd "$root"

case "$action" in
  list)
    mine=$(owner_of "$(origin_of . || true)")
    declare -A recorded=()
    while read -r p url; do recorded[$p]=$url; done < <(listed .)
    unlisted=0
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      note=""
      if [ -d "$p/.git" ]; then
        url=$(origin_of "$p" || true)
        state=clean; [ -z "$(git -C "$p" status --porcelain 2>/dev/null | head -1)" ] || state=changed
        if [ -z "${recorded[$p]+x}" ]; then note="  (not in .repos)"; unlisted=1
        elif [ "${recorded[$p]}" != "$url" ]; then note="  (.repos has ${recorded[$p]})"; fi
      else
        url=${recorded[$p]}; state=missing
      fi
      who=others; [ -n "$url" ] && [ "$(owner_of "$url")" = "$mine" ] && who=mine
      printf '%-48s %-6s %-7s %s%s\n' "$p" "$who" "$state" "${url:-(no origin)}" "$note"
    done < <({ nested; listed . | cut -d' ' -f1; } | sort -u)
    [ "$unlisted" = 0 ] || echo "a repo not in .repos: \`util repos add <path>\` records it, so a new clone gets it back" >&2
    ;;

  paths) nested ;;

  mine)
    mine=$(owner_of "$(origin_of . || true)")
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      url=$(origin_of "$p") || continue
      [ "$(owner_of "$url")" = "$mine" ] && printf '%s\n' "$p" || true
    done < <(nested)
    ;;

  restore)
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
      (cd "$p" && "$0" restore) || failed=1
    done < .repos
    exit "$failed"
    ;;
esac
