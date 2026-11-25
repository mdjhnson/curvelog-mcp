#!/usr/bin/env node
// curvelog-mcp: a local MCP server that an AI app on this computer starts, for example Claude
// Desktop or the ChatGPT desktop app. It reads the copy of a person's brews that Curvelog on their
// iPhone or iPad keeps in iCloud Drive, and answers on standard output. It only reads, and it
// makes no network calls.
//
// Standard output carries only protocol messages, one per line, so anything else goes to
// standard error.
//
//   curvelog-mcp [--dir <folder>]    or set CURVELOG_DIR

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { chosenDir, findCopy, placesToLook, readCurves } from './lib/find.js';
import { handle } from './lib/protocol.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const dir = chosenDir(process.argv.slice(2), process.env);

// Say where the copy is (or isn't) when that changes, not on every call.
let lastNote = null;
function note(text) {
  if (text !== lastNote) process.stderr.write(text + '\n');
  lastNote = text;
}

function input() {
  const copy = findCopy({ dir, log: (text) => process.stderr.write(text + '\n') });
  if (copy) {
    note(`curvelog-mcp: reading ${copy.folder}`);
  } else {
    const places = placesToLook({ dir }).flat();
    note(`curvelog-mcp: no copy of Curvelog's brews found${places.length ? ` in ${places.join(', ')}` : ''}`);
  }
  return {
    snapshot: copy?.snapshot ?? null,
    curves: () => (copy ? readCurves(copy.folder) : null),
    now: new Date(),
  };
}

// An AI app that quits mid-reply closes the pipe; that's the end, not an error.
process.stdout.on('error', () => process.exit(0));

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
lines.on('line', (line) => {
  if (line.trim() === '') return;
  const reply = handle(line, { version, input });
  if (reply !== null) process.stdout.write(reply + '\n');
});
