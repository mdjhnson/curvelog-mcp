// The five read-only tools, ported from Curvelog's MCPTools.swift. Their answers are plain text and
// match the Swift helper's word for word, apart from the notes about where the copy comes from
// (the iPhone or iPad, through iCloud Drive, rather than Curvelog for Mac).
//
// `input` is what was found when the tool was called:
//   snapshot  the decoded snapshot, or null when there's no copy to read
//   problem   with no snapshot: 'notDownloaded' (only an iCloud placeholder is there),
//             'unreadable' (a snapshot.json is there but can't be read), or null (nothing at all)
//   curves    a function that reads curves.json's text: null when it isn't there, or
//             { problem: 'notDownloaded' } when only its iCloud placeholder is; only
//             get_brew_curve calls it
//   now       a Date
//   timeZone  an IANA name such as "UTC", or undefined for the computer's own

import { containsFolded, dateText, isObject, sameFolded, sameIgnoringCase, swiftJSON, trimmed } from './text.js';

export const maxRecent = 50;

function tool(name, description, properties, required = []) {
  const inputSchema = { type: 'object', properties };
  if (required.length > 0) inputSchema.required = required;
  return { name, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } };
}

/** tools/list. Every tool only reads. */
export const definitions = [
  tool('list_recent_brews',
    'List the newest coffee brews logged in Curvelog, newest first: date, coffee, method, recipe, taste and the brew\'s id. Hidden brews are left out.',
    { count: { type: 'integer', minimum: 1, maximum: maxRecent, default: 10, description: `How many brews, 1 to ${maxRecent}.` } }),
  tool('get_brew',
    'One brew in full: its numbers, pours, how it tasted, the coffee, the brews before it and Curvelog\'s advice for next time. Leave brew_id out for the newest brew.',
    { brew_id: { type: 'string', description: 'A brew id from list_recent_brews.' } }),
  tool('find_coffees',
    'Find coffees by name or roaster, with the methods each was brewed with. Leave query out to list them all.',
    { query: { type: 'string', description: 'Part of a coffee\'s name or roaster.' } }),
  tool('get_dial_in',
    'A coffee on one brew method: every brew so far in order, what Curvelog has noticed and its plan for the next brew.',
    {
      coffee: { type: 'string', description: 'The coffee\'s name or id.' },
      method: { type: 'string', description: 'The brew method\'s name (V60, AeroPress, Espresso…) or id.' },
    },
    ['coffee', 'method']),
  tool('get_brew_curve',
    'The scale readings behind one brew\'s curve as JSON: seconds, grams, the cleaned weight and the flow. Only for recent brews logged from a scale. A MAVO Lumicurve logs a weight only when the reading holds still, so an espresso shot often has just a few readings near its end: the cleaned weight between them is a straight line, not measured flow.',
    { brew_id: { type: 'string', description: 'A brew id from list_recent_brews.' } },
    ['brew_id']),
];

export const missingText = 'Curvelog hasn\'t shared any brews to iCloud Drive yet. In Curvelog on your iPhone or iPad, go to Settings → AI apps and turn on Keep a copy for AI apps on a computer. On Windows, install iCloud for Windows and turn on iCloud Drive.';

export const notDownloadedText = 'Curvelog\'s copy is in iCloud Drive but isn\'t downloaded to this Mac yet. In Finder, open iCloud Drive → Curvelog → AI apps once, or right-click the folder and choose Download Now.';

export const unreadableText = 'Curvelog\'s copy in iCloud Drive couldn\'t be read. It may still be syncing; try again in a moment. If it keeps happening, update this helper: github.com/mdjhnson/curvelog-mcp.';

/** Why there's nothing to read. */
function absentText(problem) {
  if (problem === 'notDownloaded') return notDownloadedText;
  if (problem === 'unreadable') return unreadableText;
  return missingText;
}

const result = (text, isError = false) => ({ text, isError });

/** tools/call: { text, isError }. */
export function call(name, args, input) {
  if (!definitions.some((definition) => definition.name === name)) {
    return result(`Curvelog has no tool called ${name}.`, true);
  }
  const { snapshot } = input;
  if (!snapshot) return result(absentText(input.problem), true);
  if (snapshot.locked) return result(lockedText(snapshot.locked), true);
  let answer;
  switch (name) {
    case 'list_recent_brews': answer = recentBrews(int(args.count) ?? 10, snapshot, input.timeZone); break;
    case 'get_brew': answer = brew(trimmed(args.brew_id), snapshot, input.timeZone); break;
    case 'find_coffees': answer = coffees(trimmed(args.query), snapshot); break;
    case 'get_dial_in': answer = dialIn(trimmed(args.coffee), trimmed(args.method), snapshot); break;
    default: answer = curve(trimmed(args.brew_id), input.curves());
  }
  // Not after a curve, whose text is JSON to parse.
  const note = name === 'get_brew_curve' ? null : staleNote(snapshot, input.now, input.timeZone);
  if (note) answer.text += '\n\n' + note;
  return answer;
}

export function lockedText(reason) {
  return reason === 'needsPro'
    ? 'Reading brews from an AI app is part of Curvelog Pro. Open Curvelog to unlock Pro.'
    : 'AI access is turned off in Curvelog. To turn it on, open Curvelog on your iPhone or iPad, go to Settings → AI apps and turn on Keep a copy for AI apps on a computer.';
}

/** Curvelog rewrites the copy only while it's open, so an old copy may be missing some brews. */
export function staleNote(snapshot, now, timeZone) {
  if (now.getTime() - snapshot.generatedAt.getTime() <= 3600 * 1000) return null;
  return `(Curvelog last updated this copy on ${dateText(snapshot.generatedAt, timeZone)}. Brews logged since then show up once Curvelog is opened on your iPhone or iPad.)`;
}

function recentBrews(count, snapshot, timeZone) {
  if (snapshot.brews.length === 0) return result('There are no brews in Curvelog yet.');
  const brews = snapshot.brews.slice(0, Math.min(Math.max(count, 1), maxRecent));
  const lines = brews.map((entry) => '- ' + line(entry, timeZone));
  return result(`The newest ${brews.length} brews, newest first:\n` + lines.join('\n'));
}

function brew(id, snapshot, timeZone) {
  let found;
  if (id !== null) {
    found = snapshot.brews.find((entry) => sameIgnoringCase(entry.id, id));
    if (!found) return result(`No brew has the id ${id}. list_recent_brews gives the ids.`, true);
  } else {
    found = snapshot.brews[0];
  }
  if (!found) return result('There are no brews in Curvelog yet.');
  if (found.summary !== null) return result(found.summary);
  return result(line(found, timeZone) + '\n\nCurvelog shares the full details only for its newest brews. get_dial_in has this coffee\'s brews in order.');
}

function coffees(query, snapshot) {
  const found = snapshot.coffees.filter((coffee) =>
    query === null || containsFolded(coffee.name, query) || containsFolded(coffee.roaster ?? '', query));
  if (found.length === 0) {
    return result(query !== null ? `No coffee in Curvelog matches "${query}".` : 'There are no coffees in Curvelog yet.');
  }
  const lines = found.map((coffee) => {
    const parts = [coffee.name + (coffee.roaster !== null ? ` from ${coffee.roaster}` : '')];
    if (coffee.archived) parts.push('a previous coffee');
    parts.push(coffee.methods.length === 0 ? 'not brewed yet' : 'brewed on ' + coffee.methods.join(', '));
    parts.push(`id: ${coffee.id}`);
    return '- ' + parts.join(' · ');
  });
  return result(lines.join('\n'));
}

function dialIn(coffee, method, snapshot) {
  if (coffee === null || method === null) return result('get_dial_in needs a coffee and a method.', true);
  const forCoffee = matches(snapshot.dialIns, coffee, 'coffeeID', 'coffee');
  if (forCoffee.length === 0) {
    return result(`No recent dial-in is for a coffee called "${coffee}". Curvelog shares the ${snapshot.dialIns.length} dial-ins brewed most recently; find_coffees lists every coffee and the methods it was brewed on.`, true);
  }
  const found = matches(forCoffee, method, 'methodID', 'method');
  if (found.length === 1) return result(found[0].summary);
  // With ids, since two bags can share a name.
  const options = (found.length === 0 ? forCoffee : found).map((entry) =>
    `- ${entry.coffee} on ${entry.method} (${entry.brewCount} brews) · coffee id: ${entry.coffeeID} · method id: ${entry.methodID}`);
  const lead = found.length === 0
    ? `"${coffee}" hasn't been brewed on "${method}". Its dial-ins:`
    : 'More than one dial-in matches. Ask again with one of these:';
  return result([lead, ...options].join('\n'), true);
}

/** An id, then an exact name, then part of a name; the first kind that finds any wins. */
function matches(dialIns, query, idKey, nameKey) {
  const byID = dialIns.filter((entry) => sameIgnoringCase(entry[idKey], query));
  if (byID.length > 0) return byID;
  const exact = dialIns.filter((entry) => sameFolded(entry[nameKey], query));
  if (exact.length > 0) return exact;
  return dialIns.filter((entry) => containsFolded(entry[nameKey], query));
}

function curve(id, curvesText) {
  if (id === null) return result('get_brew_curve needs a brew_id.', true);
  const missing = result('Curvelog has no curve to share for that brew: it was typed in by hand, or it\'s older than the newest brews it shares curves for.', true);
  if (isObject(curvesText) && curvesText.problem === 'notDownloaded') return result(notDownloadedText, true);
  if (typeof curvesText !== 'string') return missing;
  let file;
  try {
    file = JSON.parse(curvesText.replace(/^﻿/, ''));
  } catch {
    return missing;
  }
  const brews = isObject(file) ? file.brews : undefined;
  if (!Array.isArray(brews) || !brews.every(isObject)) return missing;
  const found = brews.find((entry) => typeof entry.id === 'string' && sameIgnoringCase(entry.id, id));
  return found ? result(swiftJSON(found)) : missing;
}

/** One brew on one line, as list_recent_brews shows it. */
export function line(entry, timeZone) {
  let what = entry.coffee ?? (entry.mode === 'espresso' ? 'Espresso' : 'Brew');
  if (entry.roaster !== null) what += ` from ${entry.roaster}`;
  if (entry.method !== null) what += ` on ${entry.method}`;
  const parts = [entry.date ? dateText(entry.date, timeZone) : 'no date', what];
  if (entry.recipe !== '') parts.push(entry.recipe);
  if (entry.taste !== null) parts.push(`tasted ${entry.taste.toLowerCase()}`);
  if (entry.rating !== null) parts.push(`${entry.rating} of 5 stars`);
  parts.push(`id: ${entry.id}`);
  return parts.join(' · ');
}

/** A number, or a string that is a whole number ("2", "+2", "-3"); null otherwise. Like Swift's. */
function int(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  // JSONSerialization's true and false are NSNumbers, which Swift reads as 1 and 0.
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value !== 'string' || !/^[+-]?[0-9]+$/.test(value)) return null;
  const number = Number(value);
  return Math.abs(number) <= 9223372036854775807 ? number : null;
}
