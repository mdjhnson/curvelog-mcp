// Reading snapshot.json: a file the Swift helper's decoder would refuse is no copy at all.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeSnapshot } from '../lib/snapshot.js';
import { fixtureText } from './helpers.js';

const base = () => JSON.parse(fixtureText('snapshot.json'));
const decode = (object) => decodeSnapshot(JSON.stringify(object));

test('a good snapshot decodes, with ids in upper case', () => {
  const file = base();
  file.brews[0].id = file.brews[0].id.toLowerCase();
  const snapshot = decode(file);
  assert.equal(snapshot.brews[0].id, '6F1D2A10-0000-4000-8000-000000000021');
  assert.equal(snapshot.brews[2].date, null);
  assert.equal(snapshot.brews[2].coffee, null);
  assert.equal(snapshot.locked, null);
  assert.equal(snapshot.dialIns[0].lastBrew.toISOString(), '2027-01-15T07:00:00.000Z');
});

test('a locked snapshot decodes', () => {
  const snapshot = decode({ formatVersion: 1, generatedAt: '2027-01-15T08:00:00Z', locked: 'needsPro', instructions: '', brews: [], coffees: [], dialIns: [] });
  assert.equal(snapshot.locked, 'needsPro');
});

test('offsets and a byte order mark are fine', () => {
  const file = base();
  file.generatedAt = '2027-01-15T09:00:00+0100';
  assert.equal(decode(file).generatedAt.toISOString(), '2027-01-15T08:00:00.000Z');
  assert.ok(decodeSnapshot('﻿' + fixtureText('snapshot.json')));
});

test('a missing or mistyped field makes it unreadable', () => {
  const broken = [
    (file) => delete file.generatedAt,
    (file) => delete file.formatVersion,
    (file) => { file.locked = 'later'; },
    (file) => { file.generatedAt = '2027-01-15 08:00:00'; },
    (file) => { file.brews[0].id = 'not-a-uuid'; },
    (file) => delete file.brews[0].mode,
    (file) => { file.brews[0].rating = 4.5; },
    (file) => { file.coffees[0].archived = 'no'; },
    (file) => { file.dialIns[0].brewCount = '4'; },
    (file) => { file.coffees[0].methods = [1]; },
    (file) => { file.dialIns = null; },
  ];
  for (const breakIt of broken) {
    const file = base();
    breakIt(file);
    assert.equal(decode(file), null, breakIt.toString());
  }
  assert.equal(decodeSnapshot('not json'), null);
  assert.equal(decodeSnapshot('[]'), null);
});
