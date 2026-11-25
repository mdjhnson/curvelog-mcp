// The contract with Curvelog: the same made-up snapshot and the same answers as the Swift helper.
// test/fixtures is a copy of Curvelog's Tests/Fixtures/mcp, written by its MCPGoldenTests with
// now = generatedAt and the time zone UTC.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeSnapshot } from '../lib/snapshot.js';
import { call } from '../lib/tools.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const snapshot = decodeSnapshot(fixture('snapshot.json'));
const curves = fixture('curves.json');
const cases = JSON.parse(fixture('cases.json'));

test('the fixture snapshot decodes', () => {
  assert.ok(snapshot);
  assert.equal(snapshot.generatedAt.toISOString(), '2027-01-15T08:00:00.000Z');
  assert.equal(cases.length, 23);
});

for (const golden of cases) {
  test(`golden: ${golden.name}`, () => {
    const input = { snapshot, curves: () => curves, now: snapshot.generatedAt, timeZone: 'UTC' };
    const result = call(golden.tool, golden.arguments, input);
    assert.equal(result.text, golden.text);
    assert.equal(result.isError, golden.isError);
  });
}
