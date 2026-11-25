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
import { handleSafely } from './lib/protocol.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const dir = chosenDir(process.argv.slice(2), process.env);

function log(text) {
  try {
    process.stderr.write(text + '\n');
  } catch {
    // Nowhere to say it.
  }
}

// Each call looks for the copy again and notes what it found. A note is written only when it
// wasn't among the previous call's notes, so the same "reading" or "can't read" line isn't
// repeated on every call.
let lastNotes = new Set();
function noteAll(notes) {
  for (const text of notes) if (!lastNotes.has(text)) log(text);
  lastNotes = new Set(notes);
}

function input() {
  const notes = [];
  const copy = findCopy({ dir, log: (text) => notes.push(text) });
  if (copy?.snapshot) {
    notes.push(`curvelog-mcp: reading ${copy.folder}`);
  } else if (!copy) {
    const places = placesToLook({ dir }).flat();
    notes.push(`curvelog-mcp: no copy of Curvelog's brews found${places.length ? ` in ${places.join(', ')}` : ''}`);
  }
  noteAll(notes);
  return {
    snapshot: copy?.snapshot ?? null,
    problem: copy?.problem ?? null,
    curves: () => (copy?.folder ? readCurves(copy.folder) : null),
    now: new Date(),
  };
}

// An AI app that quits mid-reply closes the pipe; that's the end, not an error.
process.stdout.on('error', () => process.exit(0));

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
lines.on('line', (line) => {
  if (line.trim() === '') return;
  // A message that throws gets -32603 for its id, and the server keeps going.
  const reply = handleSafely(line, { version, input }, log);
  if (reply !== null) process.stdout.write(reply + '\n');
});
