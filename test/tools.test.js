// What the tools say when there's no copy, a locked one or an old one, and the edges of their
// arguments.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, lockedText, missingText, notDownloadedText, unreadableText } from '../lib/tools.js';
import { fixtureSnapshot, input, locked, newest } from './helpers.js';

test('no copy says how to turn it on', () => {
  const result = call('list_recent_brews', {}, input(null));
  assert.deepEqual(result, {
    text: 'Curvelog hasn\'t shared any brews to iCloud Drive yet. In Curvelog on your iPhone or iPad, go to Settings → AI apps and turn on Keep a copy for AI apps on a computer. On Windows, install iCloud for Windows and turn on iCloud Drive.',
    isError: true,
  });
  assert.equal(result.text, missingText);
  // An unknown tool is still unknown.
  assert.equal(call('delete_brew', {}, input(null)).text, 'Curvelog has no tool called delete_brew.');
});

test('a locked copy says why', () => {
  assert.deepEqual(call('get_brew', {}, input(locked('needsPro'))), {
    text: 'Reading brews from an AI app is part of Curvelog Pro. Open Curvelog to unlock Pro.',
    isError: true,
  });
  assert.deepEqual(call('get_brew_curve', { brew_id: newest }, input(locked('turnedOff'))), {
    text: 'AI access is turned off in Curvelog. To turn it on, open Curvelog on your iPhone or iPad, go to Settings → AI apps and turn on Keep a copy for AI apps on a computer.',
    isError: true,
  });
  assert.equal(lockedText('turnedOff'), call('find_coffees', {}, input(locked('turnedOff'))).text);
});

test('an old copy says when it was made, except on a curve', () => {
  const snapshot = fixtureSnapshot();
  const anHourOn = new Date(snapshot.generatedAt.getTime() + 3600 * 1000);
  assert.equal(call('get_brew', {}, input(snapshot, anHourOn)).text, 'This brew: Señor Café espresso in full.');

  const later = new Date(snapshot.generatedAt.getTime() + 3601 * 1000);
  assert.equal(call('get_brew', {}, input(snapshot, later)).text,
    'This brew: Señor Café espresso in full.\n\n(Curvelog last updated this copy on 2027-01-15 08:00:00. Brews logged since then show up once Curvelog is opened on your iPhone or iPad.)');
  const missing = call('get_brew', { brew_id: 'nope' }, input(snapshot, later));
  assert.ok(missing.isError && missing.text.endsWith('once Curvelog is opened on your iPhone or iPad.)'));

  const curve = call('get_brew_curve', { brew_id: newest }, input(snapshot, later));
  assert.doesNotThrow(() => JSON.parse(curve.text));
  assert.ok(!curve.text.includes('last updated'));
});

test('the stale note uses the time zone it is given', () => {
  const snapshot = fixtureSnapshot();
  const later = new Date(snapshot.generatedAt.getTime() + 2 * 3600 * 1000);
  const text = call('find_coffees', {}, { ...input(snapshot, later), timeZone: 'America/Chicago' }).text;
  assert.ok(text.includes('last updated this copy on 2027-01-15 02:00:00.'));
});

test('count reads numbers and number strings like Swift', () => {
  const count = (value) => call('list_recent_brews', { count: value }, input()).text.split('\n')[0];
  assert.equal(count(1), 'The newest 1 brews, newest first:');
  assert.equal(count(2.9), 'The newest 2 brews, newest first:');
  assert.equal(count('+2'), 'The newest 2 brews, newest first:');
  assert.equal(count(0), 'The newest 1 brews, newest first:');
  assert.equal(count('-4'), 'The newest 1 brews, newest first:');
  assert.equal(count(true), 'The newest 1 brews, newest first:');
  // Not whole numbers: the default of 10, which is all three here.
  for (const value of [' 2', '2.0', 'two', null, {}]) assert.equal(count(value), 'The newest 3 brews, newest first:');
});

test('string arguments are trimmed, and blank ones are left out', () => {
  assert.equal(call('get_brew', { brew_id: '  \u0085' }, input()).text, 'This brew: Señor Café espresso in full.');
  assert.equal(call('get_brew', { brew_id: '\t6f1d2a10-0000-4000-8000-000000000022\n' }, input()).text, 'This brew: Guji on V60 in full.');
  assert.equal(call('get_brew', { brew_id: 42 }, input()).text, 'This brew: Señor Café espresso in full.');
  assert.equal(call('get_brew_curve', { brew_id: ' ' }, input()).text, 'get_brew_curve needs a brew_id.');
});

test('an empty copy says there is nothing yet', () => {
  const empty = { ...fixtureSnapshot(), brews: [], coffees: [], dialIns: [] };
  assert.deepEqual(call('list_recent_brews', {}, input(empty)), { text: 'There are no brews in Curvelog yet.', isError: false });
  assert.deepEqual(call('get_brew', {}, input(empty)), { text: 'There are no brews in Curvelog yet.', isError: false });
  assert.deepEqual(call('find_coffees', {}, input(empty)), { text: 'There are no coffees in Curvelog yet.', isError: false });
});

test('two dial-ins with the same name ask which one', () => {
  const snapshot = fixtureSnapshot();
  const twin = { ...snapshot.dialIns[1], coffeeID: '6F1D2A10-0000-4000-8000-000000000009', summary: 'Other Guji.' };
  const result = call('get_dial_in', { coffee: 'Guji', method: 'V60' }, input({ ...snapshot, dialIns: [...snapshot.dialIns, twin] }));
  assert.equal(result.isError, true);
  assert.equal(result.text, [
    'More than one dial-in matches. Ask again with one of these:',
    '- Guji on V60 (3 brews) · coffee id: 6F1D2A10-0000-4000-8000-000000000001 · method id: 6F1D2A10-0000-4000-8000-000000000011',
    '- Guji on V60 (3 brews) · coffee id: 6F1D2A10-0000-4000-8000-000000000009 · method id: 6F1D2A10-0000-4000-8000-000000000011',
  ].join('\n'));
});

test('a curve is found by id in any case, and a broken curves file has none', () => {
  const lower = call('get_brew_curve', { brew_id: newest.toLowerCase() }, input());
  assert.equal(lower.isError, false);
  const broken = { ...input(), curves: () => '{"brews": [1]}' };
  assert.equal(call('get_brew_curve', { brew_id: newest }, broken).isError, true);
  const none = { ...input(), curves: () => null };
  assert.equal(call('get_brew_curve', { brew_id: newest }, none).isError, true);
});

test('a copy that is not downloaded or can\'t be read says so', () => {
  const notDownloaded = { ...input(null), problem: 'notDownloaded' };
  assert.deepEqual(call('list_recent_brews', {}, notDownloaded), {
    text: 'Curvelog\'s copy is in iCloud Drive but isn\'t downloaded to this Mac yet. In Finder, open iCloud Drive → Curvelog → AI apps once, or right-click the folder and choose Download Now.',
    isError: true,
  });
  assert.equal(notDownloadedText, call('get_brew', {}, notDownloaded).text);
  const unreadable = { ...input(null), problem: 'unreadable' };
  assert.deepEqual(call('find_coffees', {}, unreadable), {
    text: 'Curvelog\'s copy in iCloud Drive couldn\'t be read. It may still be syncing; try again in a moment. If it keeps happening, update this helper: github.com/mdjhnson/curvelog-mcp.',
    isError: true,
  });
  assert.equal(unreadableText, call('get_dial_in', { coffee: 'Guji', method: 'V60' }, unreadable).text);
});

test('a curves file that is not downloaded says so', () => {
  const evicted = { ...input(), curves: () => ({ problem: 'notDownloaded' }) };
  assert.deepEqual(call('get_brew_curve', { brew_id: newest }, evicted), { text: notDownloadedText, isError: true });
  // A missing brew_id is still asked for first.
  assert.equal(call('get_brew_curve', {}, evicted).text, 'get_brew_curve needs a brew_id.');
});
