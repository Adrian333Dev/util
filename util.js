#!/usr/bin/env node
'use strict';
/**
 * util: one name for all the small commands you write for yourself.
 *
 * A dispatcher, not a monolith. Nothing is built into this program: it reads a
 * registry of source directories, builds one namespace out of everything it
 * finds, and runs the file you named. The `commands/` folder beside this file
 * is one of those directories, registered like any other. A source is any
 * directory laid out `<namespace>/<command>`, so a command is an executable in
 * any language and `util` never sees its arguments.
 *
 * That last part is what separates this from a program with subcommands. Such
 * a program declares every flag it accepts and refuses an undeclared one.
 * `util` dispatches to programs it did not write, so everything after the
 * command name passes through untouched and each command validates its own.
 *
 *   util <namespace> <command> [args]
 *   util <command> [args]              unique across namespaces, so it resolves
 *   util ls                            every command there is
 *   util install                       the two PATH names, and this source
 *   util uninstall                     both names off PATH, this source gone
 *   util source add <path>             read commands from a directory
 *
 * Two names on PATH, `util` and `u`, one program.
 */

const os = require('os');
const { spawnSync } = require('child_process');
const { UtilError } = require('./lib/error');
const catalogue = require('./lib/catalog');
const render = require('./lib/render');
const { nearest } = require('./lib/suggest');
const ls = require('./builtin/ls');
const install = require('./builtin/install');
const uninstall = require('./builtin/uninstall');
const source = require('./builtin/source');

// `util ls | head -2` closes the pipe while node is still writing into it. The
// default is an uncaught EPIPE printed over whatever you were reading, for
// something that is not a failure: the reader stopped, which is what head is for.
process.stdout.on('error', (e) => {
  if (e.code === 'EPIPE') process.exit(0);
  throw e;
});

const out = (s) => process.stdout.write(s.endsWith('\n') ? s : s + '\n');

const HELP_WORDS = ['-h', '--help', 'help'];

/** Wider than the listing's, because a built-in prints its arguments too. */
const HELP_WIDTH = 24;

const BUILTIN = { ls, install, uninstall };
const GROUPS = { source };

const TITLE = 'util: one name for all the small commands you write for yourself';

const NOTES = `shape    util <namespace> <command> [args]. A word that names no namespace is
         looked up in all of them, and runs when exactly one command has that
         name, so util tree finds fs tree until a second tree exists
groups   a namespace is a folder of commands that belong together, like git
         or fs. It can give itself a short alias in a .alias file holding the
         one word, which is how util g save works
sources  ~/.util/sources, one path per line, # for a comment. Every directory
         named there adds the commands it holds, so a public repository, a
         private one and a single project can all add commands without
         knowing about each other. A project's own .util/ folder is picked up
         from the working directory and never written to the registry
adding   write an executable at <source>/<namespace>/<command> and it exists.
         The filename is the command name with any extension dropped, so
         git/save.sh is util git save. To publish a command, move the file:
         mv it from a project's .util/ into the repository that should have it
args     everything after the command name reaches the command untouched, so
         util git save --help is that command's own help
listing  util ls prints the first sentence of each command's header comment,
         after a leading util <namespace> <command>: when it has one
clash    two sources claiming one namespace/command both refuse to run, and
         name both files. Nothing is ever hidden silently`;

function help() {
  const lines = [TITLE, ''];
  for (const [name, command] of Object.entries(BUILTIN)) {
    lines.push(render.row(2, `util ${name}`, command.summary, HELP_WIDTH));
  }
  for (const [name, group] of Object.entries(GROUPS)) {
    for (const [action, decl] of Object.entries(group.actions)) {
      lines.push(render.row(
        2, `util ${name} ${action}${decl.args ? ' ' + decl.args : ''}`, decl.summary, HELP_WIDTH));
    }
  }
  lines.push('', NOTES, '', render.listing(catalogue.build()));
  return lines.join('\n');
}

/** A group's actions, with the default one reachable by leaving the word out. */
function runGroup(name, group, argv) {
  const [typed, ...args] = argv;
  if (!typed || HELP_WORDS.includes(typed)) {
    const lines = [`util ${name}: ${group.summary}`, ''];
    for (const [action, decl] of Object.entries(group.actions)) {
      lines.push(render.row(
        2, `util ${name} ${action}${decl.args ? ' ' + decl.args : ''}`, decl.summary, HELP_WIDTH));
    }
    out(lines.join('\n'));
    return 0;
  }

  const actions = Object.keys(group.actions);
  // A near miss is refused before the fallback, or `util source drpo <path>`
  // reads as an argument to the default action and complains about the wrong
  // command entirely.
  const near = actions.includes(typed) ? null : nearest(typed, actions);
  if (near) {
    throw new UtilError(
      `unknown ${name} action "${typed}".\n` +
      `  did you mean "${near}"?\n` +
      `  one of: ${actions.join(', ')}`
    );
  }

  const chosen = actions.includes(typed) ? typed : group.default;
  const rest = actions.includes(typed) ? args : argv;
  if (!chosen) {
    throw new UtilError(`unknown ${name} action "${typed}". One of: ${actions.join(', ')}.`);
  }
  return group.actions[chosen].run({ positional: rest, usage: `util ${name} ${chosen}`, out });
}

/**
 * Hand the process over to the command's own file. Arguments pass through, and
 * so does everything the terminal carries: a command that prompts, pages or
 * prints colour behaves exactly as it does when you run it by path.
 */
function execute(command, args) {
  if (!command.runnable) {
    throw new UtilError(
      `${command.file} is not executable, so it cannot run.\n` +
      `  chmod +x ${command.file}`
    );
  }

  const result = spawnSync(command.file, args, { stdio: 'inherit' });
  if (result.error) {
    if (result.error.code === 'ENOEXEC') {
      throw new UtilError(
        `${command.file} has no shebang line, so the system does not know what runs it.\n` +
        '  Add one on the first line: #!/usr/bin/env bash'
      );
    }
    throw new UtilError(`${command.file} would not start: ${result.error.message}`);
  }

  // A command killed by a signal exits the way a shell reports it, so Ctrl-C
  // inside a command reads as Ctrl-C rather than as a clean exit.
  if (result.signal) return 128 + (os.constants.signals[result.signal] || 0);
  return result.status === null ? 0 : result.status;
}

function dispatch(argv) {
  if (!argv.length || HELP_WORDS.includes(argv[0])) {
    out(help());
    return 0;
  }

  const [first, ...rest] = argv;
  if (first.startsWith('-')) {
    throw new UtilError(`"${first}" is a flag. A namespace or a command comes first.`);
  }

  if (BUILTIN[first]) return BUILTIN[first].run({ positional: rest, usage: `util ${first}`, out });
  if (GROUPS[first]) return runGroup(first, GROUPS[first], rest);

  const catalog = catalogue.build();

  const ns = catalog.namespaces.get(first);
  if (ns) {
    const [typed, ...args] = rest;
    if (!typed || HELP_WORDS.includes(typed)) {
      out(render.namespace(catalog, ns));
      return 0;
    }
    const command = catalogue.resolveCommand(catalog, ns.name, typed);
    if (command) return execute(command, args);
    // Every source's commands, not this namespace object's: a second source
    // adding to the same namespace has its own, and a typo can be aimed at one.
    const here = [...catalog.byFull.keys()]
      .filter((key) => key.startsWith(`${ns.name}/`))
      .map((key) => key.slice(ns.name.length + 1));
    const near = nearest(typed, here);
    throw new UtilError(
      `${ns.name} has no command "${typed}".\n` +
      (near ? `  did you mean "${near}"?\n` : '') +
      `  util ${ns.name} lists what it does have.`
    );
  }

  const short = catalogue.resolveShort(catalog, first);
  if (short) return execute(short, rest);

  const known = [...catalog.namespaces.keys()].sort();
  // An alias and its namespace are one candidate, so `gti` answers `git`
  // rather than calling git, g and gh a three-way tie.
  const namespaceOf = new Map([...catalog.namespaces].map(([key, ns]) => [key, ns.name]));
  const near = nearest(first, [
    ...Object.keys(BUILTIN), ...Object.keys(GROUPS), ...known, ...catalog.byName.keys(),
  ], (name) => namespaceOf.get(name) || name);
  throw new UtilError(
    `"${first}" is neither a namespace nor a command.\n` +
    (near ? `  did you mean "${near}"?\n` : '') +
    (known.length
      ? `  namespaces: ${known.join(', ')}\n  util ls prints every command.`
      : '  No sources registered. Add one with util source add <path>.')
  );
}

try {
  process.exitCode = dispatch(process.argv.slice(2)) || 0;
} catch (e) {
  if (e instanceof UtilError) {
    process.stderr.write(`util: ${e.message}\n`);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
