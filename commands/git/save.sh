#!/usr/bin/env bash
# util git save: stage everything, commit it and push, in one command.
#
#   util git save                     everything, generated message, push
#   util git save "fix the parser"    everything, that message, push
#   util git save -p src,docs "msg"   stage only those paths (comma-separated)
#   util git save -n                  commit, do not push
#   util git save --dry-run           print the commands, run none of them
#
# That is all of it. This shortens `add && commit && push` and replaces nothing
# else: amend, revert, rebase and force are plain git commands.

set -euo pipefail

me="util git save"
msg=""
push=1
dry=0
paths=()

# The help text is this file's own header, minus the shebang. Read that way
# so moving a line never silently truncates the help.
usage() {
  awk 'NR == 1 { next }
       /^#/ {
         sub(/^# ?/, "")
         if ($0 == "" && !seen) next
         seen = 1
         print
         next
       }
       { exit }' "$0"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--message) msg="${2:?$me: -m needs a message}"; shift 2 ;;
    -p|--path)    IFS=',' read -r -a _split <<< "${2:?$me: -p needs a path}"
                  for p in "${_split[@]}"; do [ -n "$p" ] && paths+=("$p"); done
                  shift 2 ;;
    -n|--no-push) push=0; shift ;;
    --dry-run)    dry=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    -*)           echo "$me: unknown option $1 (try $me --help)" >&2; exit 1 ;;
    *)            if [ -z "$msg" ]; then msg="$1"; shift
                  else echo "$me: unexpected argument \"$1\", quote the message" >&2; exit 1; fi ;;
  esac
done

git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "$me: not inside a git repository." >&2; exit 1; }

# A submodule is checked out at a commit rather than a branch, so this lands here
# often. Detached, the commit is reachable by SHA alone and the push cannot name a
# remote branch. Refuse before staging, rather than stranding a commit and failing.
if ! git symbolic-ref -q HEAD >/dev/null; then
  echo "$me: HEAD is detached, so a commit here would belong to no branch." >&2
  echo "       Put one on it first: git switch -c <branch>" >&2
  exit 1
fi

run() {
  if [ "$dry" = 1 ]; then
    local out; out=$(printf '%q ' "$@"); echo "  ${out% }"
  else
    "$@"
  fi
}

# The deepest folder holding every path given, or nothing.
common_dir() {
  local prefix="" dir p first=1
  for p in "$@"; do
    dir=${p%/*}; [ "$dir" != "$p" ] || dir=""
    if [ "$first" = 1 ]; then prefix=$dir; first=0; continue; fi
    while [ -n "$prefix" ] && [ "$dir" != "$prefix" ] && [ "${dir#"$prefix"/}" = "$dir" ]; do
      case "$prefix" in */*) prefix=${prefix%/*} ;; *) prefix="" ;; esac
    done
  done
  printf '%s' "$prefix"
}

# The top-level names holding the most of the paths given, up to 3, largest first.
largest_groups() {
  printf '%s\n' "$@" | cut -d/ -f1 | sort | uniq -c | sort -s -k1,1nr | head -3 | sed 's/^ *[0-9]* //'
}

join_names() {
  local out="$1"; shift
  for name in "$@"; do out+=", $name"; done
  printf '%s' "$out"
}

# No message given: say what changed and how much, from the staged diff alone.
#
#   backlog.md +12 -3
#   skills/dev/fold/SKILL.md (new) +80
#   docs/a.md → docs/b.md
#   skills/dev/fold: 4 files +120 -30
#   docs/dev, backlog.md, README.md: 12 files +310 -95
#   lab/domain-skills (submodule)
#
# 1 or 2 files are named. 3 or more are named by the deepest folder holding all
# of them, or else by up to 3 groups, largest first, a group being everything
# under one top-level name. (new) and (deleted) appear only when true of every
# file. Past 72 characters the names shrink to top-level names, then go.
generated_message() {
  local files=() olds=() subs=() added=0 removed=0 all_new=1 all_deleted=1
  local meta p old a d rest i n

  # --raw gives each file's status and modes. Mode 160000 is a submodule.
  while IFS= read -r -d '' meta; do
    IFS= read -r -d '' p
    old=""
    case "${meta##* }" in R*|C*) old=$p; IFS= read -r -d '' p ;; esac
    case "${meta##* }" in A) all_deleted=0 ;; D) all_new=0 ;; *) all_new=0; all_deleted=0 ;; esac
    set -- $meta
    if [ "${1#:}" = 160000 ] || [ "$2" = 160000 ]; then subs+=(1); else subs+=(0); fi
    files+=("$p"); olds+=("$old")
  done < <(git diff --cached -z --raw)

  n=${#files[@]}
  if [ "$n" = 0 ]; then echo "no changes staged"; return; fi

  # --numstat lists the same files in the same order. A rename leaves the path
  # empty and puts both names in the next 2 fields. A binary file counts "-".
  i=0
  while IFS= read -r -d '' meta; do
    a=${meta%%$'\t'*}; rest=${meta#*$'\t'}; d=${rest%%$'\t'*}
    if [ -z "${rest#*$'\t'}" ]; then IFS= read -r -d '' _; IFS= read -r -d '' _; fi
    if [ "${subs[$i]}" = 0 ]; then
      [ "$a" = - ] || added=$((added + a))
      [ "$d" = - ] || removed=$((removed + d))
    fi
    i=$((i + 1))
  done < <(git diff --cached -z --numstat)

  local size=""
  if [ "$all_new" = 1 ]; then size=" (new)"; elif [ "$all_deleted" = 1 ]; then size=" (deleted)"; fi
  [ "$added" = 0 ] || size+=" +$added"
  [ "$removed" = 0 ] || size+=" -$removed"

  local count="$n files" msg top group names=() members=()
  [ "$n" != 1 ] || count="1 file"

  if [ "$n" -le 2 ]; then
    for i in "${!files[@]}"; do
      if [ "${subs[$i]}" = 1 ]; then names+=("${files[$i]} (submodule)")
      elif [ -n "${olds[$i]}" ]; then names+=("${olds[$i]} → ${files[$i]}")
      else names+=("${files[$i]}"); fi
    done
    msg="$(join_names "${names[@]}")$size"
  else
    group=$(common_dir "${files[@]}")
    if [ -n "$group" ]; then
      msg="$group: $count$size"
    else
      while IFS= read -r top; do
        members=()
        for p in "${files[@]}"; do case "$p" in "$top"|"$top"/*) members+=("$p") ;; esac; done
        if [ "${#members[@]}" = 1 ]; then names+=("${members[0]}"); else names+=("$(common_dir "${members[@]}")"); fi
      done < <(largest_groups "${files[@]}")
      msg="$(join_names "${names[@]}"): $count$size"
    fi
  fi

  if [ "${#msg}" -gt 72 ]; then
    names=()
    while IFS= read -r top; do names+=("$top"); done < <(largest_groups "${files[@]}")
    msg="$(join_names "${names[@]}"): $count$size"
  fi
  [ "${#msg}" -le 72 ] || msg="$count$size"
  echo "$msg"
}

if [ ${#paths[@]} -gt 0 ]; then run git add -- "${paths[@]}"; else run git add -A; fi

if [ "$dry" = 1 ] || ! git diff --cached --quiet; then
  [ -n "$msg" ] || msg=$(generated_message)
  run git commit -m "$msg"
else
  echo "$me: nothing to commit."   # still pushes, so this also means "catch the remote up"
fi

[ "$push" = 1 ] || exit 0

# A branch that has never been pushed has no upstream, and a bare push errors.
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  run git push
else
  run git push -u origin HEAD
fi
