#!/usr/bin/env bash
# util git save: stage everything, commit it and push, in one command.
#
#   util git save                     everything, generated message, push
#   util git save "fix the parser"    everything, that message, push
#   util git save -p src,docs "msg"   stage only those paths (comma-separated)
#   util git save -n                  commit, do not push
#   util git save --dry-run           print the commands, run none of them
#   util git save -w                  inside a worktree: merge it (below). In the main
#                                     checkout: list the worktrees, change nothing
#   util git save -w NAME [message]   merge the worktree NAME (its folder or its branch)
#   util git save -w ... --no-check   skip the check below
#
# -w commits the worktree (message: its branch name), replays it on top of the branch
# the main checkout has out, moves that branch up to it, and pushes that branch. The
# worktree folder stays; the worktree's own branch is never pushed. It stops, changing
# nothing further, when:
#   - the replay conflicts (the replay is undone, the files are named);
#   - the main checkout has uncommitted edits to a file the merge changes;
#   - the check fails: the shell command in `git config util.saveCheck`, run in the
#     worktree after the replay;
#   - no check is set and the main branch had moved on, so the replayed code is
#     untested: run the tests, then run it again.
# A plain `util git save` never merges anything and never looks at a worktree.
#
# That is all of it. This shortens `add && commit && push` and replaces nothing
# else: amend, revert and force are plain git commands.

set -euo pipefail

me="util git save"
msg=""
push=1
dry=0
paths=()
worktree=0
worktree_name=""
check=1

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
    -w|--worktree) worktree=1
                  if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then worktree_name="$2"; shift 2; else shift; fi ;;
    --no-check)   check=0; shift ;;
    --dry-run)    dry=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    -*)           echo "$me: unknown option $1 (try $me --help)" >&2; exit 1 ;;
    *)            if [ -z "$msg" ]; then msg="$1"; shift
                  else echo "$me: unexpected argument \"$1\", quote the message" >&2; exit 1; fi ;;
  esac
done

git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "$me: not inside a git repository." >&2; exit 1; }

run() {
  if [ "$dry" = 1 ]; then
    local out; out=$(printf '%q ' "$@"); echo "  ${out% }"
  else
    "$@"
  fi
}

# Every worktree as "folder<TAB>branch", the main checkout first. The branch is empty on a detached HEAD.
worktrees() {
  git worktree list --porcelain | awk '
    /^worktree / { if (folder != "") print folder "\t" branch; folder = substr($0, 10); branch = ""; next }
    /^branch /   { branch = $2; sub("refs/heads/", "", branch) }
    END          { if (folder != "") print folder "\t" branch }'
}

die() { echo "$me: $*" >&2; exit 1; }

# A branch that has never been pushed has no upstream, and a bare push errors.
push_in() {
  if git -C "$1" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    run git -C "$1" push
  else
    run git -C "$1" push -u origin HEAD
  fi
}

# One path per line: what the worktree changes against `$2`, committed or not.
worktree_changes() {
  { git -C "$1" -c core.quotepath=off diff --name-only "$2...HEAD"
    git -C "$1" -c core.quotepath=off diff --name-only HEAD
    git -C "$1" -c core.quotepath=off ls-files -o --exclude-standard; } | sort -u
}

# One path per line: what the main checkout holds uncommitted.
checkout_edits() {
  { git -C "$1" -c core.quotepath=off diff --name-only HEAD
    git -C "$1" -c core.quotepath=off ls-files -o --exclude-standard; } | sort -u
}

# util git save -w: merge one linked worktree into the branch the main checkout has out.
merge_worktree() {
  local name=$1 primary="" target="" folder branch here found="" kept changed edits overlap files
  local linked=()
  while IFS=$'\t' read -r folder branch; do
    if [ -z "$primary" ]; then primary=$folder; target=$branch; continue; fi
    [ -d "$folder" ] && linked+=("$folder	$branch")
  done < <(worktrees)
  [ -n "$target" ] || die "the main checkout is on a detached HEAD. Check a branch out there first."

  if [ -z "$name" ]; then
    here=$(git rev-parse --show-toplevel)
    if [ "$(cd "$here" && pwd -P)" != "$(cd "$primary" && pwd -P)" ]; then
      name=$here
    else
      echo "worktrees (pick one: $me -w <name>)"
      for kept in ${linked[@]+"${linked[@]}"}; do
        folder=${kept%%	*}
        printf '  %s   %s changed files, %s commits not in %s\n' "$(basename "$folder")" \
          "$(git -C "$folder" status --porcelain | wc -l | tr -d ' ')" \
          "$(git -C "$folder" rev-list --count "$target..HEAD" 2>/dev/null || echo '?')" "$target"
      done
      echo "merges into: $target (checked out in $primary)"
      return 0
    fi
  fi

  for kept in ${linked[@]+"${linked[@]}"}; do
    folder=${kept%%	*}; branch=${kept#*	}
    if [ "$name" = "$(basename "$folder")" ] || [ "$name" = "$branch" ] || [ "$name" = "$folder" ]; then found=$folder; break; fi
  done
  [ -n "$found" ] || die "no worktree named \"$name\". Run $me -w to list them."
  folder=$found
  branch=$(git -C "$folder" symbolic-ref -q --short HEAD) || die "the worktree $folder is on a detached HEAD, so its commit would belong to no branch."
  echo "merging $branch ($folder) into $target ($primary)"

  # Before anything changes: the edits git would refuse to overwrite.
  changed=$(worktree_changes "$folder" "$target")
  edits=$(checkout_edits "$primary")
  overlap=$(comm -12 <(printf '%s\n' "$changed") <(printf '%s\n' "$edits") | grep -v '^$' || true)
  if [ -n "$overlap" ]; then
    echo "$me: the main checkout has uncommitted edits to files this merge changes:" >&2
    printf '  %s\n' $overlap >&2
    echo "       Save or set those edits aside there, then run this again. Nothing was changed." >&2
    exit 1
  fi
  if [ -n "$edits" ]; then
    echo "the main checkout holds $(printf '%s\n' "$edits" | wc -l | tr -d ' ') uncommitted file(s), left as they are"
  fi

  if [ ${#paths[@]} -gt 0 ]; then run git -C "$folder" add -- "${paths[@]}"; else run git -C "$folder" add -A; fi
  if [ "$dry" = 1 ] || ! git -C "$folder" diff --cached --quiet; then
    run git -C "$folder" commit -m "${msg:-$branch}"
  fi

  local replayed=0
  if ! git -C "$folder" merge-base --is-ancestor "$target" "$branch"; then
    replayed=1
    if ! run git -C "$folder" rebase --quiet "$target"; then
      files=$(git -C "$folder" diff --name-only --diff-filter=U)
      git -C "$folder" rebase --abort
      echo "$me: $branch conflicts with $target in:" >&2
      printf '  %s\n' $files >&2
      echo "       The replay was undone. Fix them in $folder, then run this again." >&2
      exit 1
    fi
  fi

  local command=""
  [ "$check" = 0 ] || command=$(git config --get util.saveCheck || true)
  if [ -n "$command" ]; then
    echo "check: $command"
    if [ "$dry" = 1 ]; then echo "  (cd $folder && sh -c '$command')"
    elif ! (cd "$folder" && sh -c "$command"); then
      echo "$me: the check failed, so $target was not moved. $folder holds the committed, replayed branch." >&2
      exit 1
    fi
  elif [ "$replayed" = 1 ] && [ "$check" = 1 ] && [ "$dry" = 0 ]; then
    echo "$me: $target had moved on, so $branch was replayed on top of it and is untested." >&2
    echo "       Run the tests in $folder, then run this again. To go without: --no-check." >&2
    exit 1
  fi

  run git -C "$primary" merge --ff-only --quiet "$branch" || die "$target could not be moved up to $branch."
  [ "$push" = 0 ] || push_in "$primary"
  echo "merged $branch into $target. The worktree $folder is still there: git worktree remove, once nothing stands in it."
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

if [ "$worktree" = 1 ]; then merge_worktree "$worktree_name"; exit $?; fi

# A submodule is checked out at a commit rather than a branch, so this lands here
# often. Detached, the commit is reachable by SHA alone and the push cannot name a
# remote branch. Refuse before staging, rather than stranding a commit and failing.
if ! git symbolic-ref -q HEAD >/dev/null; then
  echo "$me: HEAD is detached, so a commit here would belong to no branch." >&2
  echo "       Put one on it first: git switch -c <branch>" >&2
  exit 1
fi

if [ ${#paths[@]} -gt 0 ]; then run git add -- "${paths[@]}"; else run git add -A; fi

if [ "$dry" = 1 ] || ! git diff --cached --quiet; then
  [ -n "$msg" ] || msg=$(generated_message)
  run git commit -m "$msg"
else
  echo "$me: nothing to commit."   # still pushes, so this also means "catch the remote up"
fi

[ "$push" = 1 ] || exit 0

push_in .
