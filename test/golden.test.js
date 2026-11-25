// The contract with Curvelog: the same made-up snapshot and the same answers as the Swift helper.
// test/fixtures is a copy of Curvelog's Tests/Fixtures/mcp, written by its MCPGoldenTests with
// now = generatedAt and the time zone UTC.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call } from '../lib/tools.js';
import { fixtureSnapshot, fixtureText, input } from './helpers.js';

const snapshot = fixtureSnapshot();
const cases = JSON.parse(fixtureText('cases.json'));

test('the fixture snapshot decodes', () => {
  assert.ok(snapshot);
  assert.equal(snapshot.generatedAt.toISOString(), '2027-01-15T08:00:00.000Z');
  assert.equal(cases.length, 23);
});

for (const golden of cases) {
  test(`golden: ${golden.name}`, () => {
    // input() sets now to the snapshot's generatedAt and the time zone to UTC.
    const result = call(golden.tool, golden.arguments, input(snapshot));
    assert.equal(result.text, golden.text);
    assert.equal(result.isError, golden.isError);
  });
}
