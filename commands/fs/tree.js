#!/usr/bin/env node
// description: a directory tree with the noise stripped out
//
// Usage: util fs tree [path] [--depth N] [--except pattern]
//   --depth N      Limit output depth (default: unlimited)
//   --except pat   Exclude by name, folder name, or glob — repeatable
//                  Examples: --except __tests__  --except .github  --except "*.md"
//
// Was `ptree` in the Flow repo until 2026-08-30. The `description:` reader it
// carried now lives in ../../lib/describe.js, where `util ls` reads it too.

const fs = require("fs");
const path = require("path");
const { clip, describeFile, describeFolder } = require("../../lib/describe");

const ME = "util fs tree";

const HIDDEN = [
  "node_modules", ".git", "dist", "build", ".next", ".turbo", "__pycache__",
  ".cache", "coverage", "out", ".svelte-kit", "temp", ".venv", "vendor", "tmp",
  ".info",
];

// ─── arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let target = ".";
let maxDepth = Infinity;
const except = [];

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--depth") maxDepth = Number(argv[++i]);
  else if (argv[i] === "--except") except.push(argv[++i]);
  else if (!argv[i].startsWith("-")) target = argv[i];
}

const globToRe = (g) =>
  new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*").replace(/\?/g, ".") + "$");

const excluded = [...HIDDEN.map((n) => globToRe(n)), ...except.map(globToRe)];
const hidden = (name) => excluded.some((re) => re.test(name));

// ─── walking and printing ────────────────────────────────────────────────────

const out = [];
let dirs = 0;
let files = 0;

function walk(dir, prefix, depth) {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const rows = entries
    .filter((e) => !hidden(e.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => {
      const full = path.join(dir, e.name);
      const isDir = e.isDirectory();
      return {
        full,
        isDir,
        label: isDir ? e.name + "/" : e.name,
        desc: isDir ? describeFolder(full) : describeFile(full),
      };
    });

  // Siblings align together, so one deep name never pushes the whole tree right.
  const width = Math.max(0, ...rows.filter((r) => r.desc).map((r) => r.label.length));

  rows.forEach((row, i) => {
    const last = i === rows.length - 1;
    row.isDir ? dirs++ : files++;
    out.push(prefix + (last ? "└── " : "├── ") +
      (row.desc ? row.label.padEnd(width) + "   // " + clip(row.desc) : row.label));
    if (row.isDir) walk(row.full, prefix + (last ? "    " : "│   "), depth + 1);
  });
}

if (!fs.existsSync(target)) {
  console.error(`${ME}: no such path — ${target}`);
  process.exit(1);
}

out.push(target);
walk(target, "", 1);
out.push("", `${dirs} ${dirs === 1 ? "directory" : "directories"}, ${files} ${files === 1 ? "file" : "files"}`);
console.log(out.join("\n"));
