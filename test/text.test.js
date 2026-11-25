// The Foundation behaviors the tools copy. Every expected value here is what Swift printed on a Mac.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containsFolded, dateText, sameFolded, swiftJSON, swiftNumber, trimmed } from '../lib/text.js';

test('numbers print like JSONSerialization (%.17g)', () => {
  const swift = [
    [0.1, '0.10000000000000001'], [1, '1'], [28, '28'], [2.5e-7, '2.4999999999999999e-07'], [1e21, '1e+21'],
    [123456789.123, '123456789.123'], [-0, '-0'], [100, '100'], [0.5, '0.5'], [3.14159, '3.1415899999999999'],
    [1e-5, '1.0000000000000001e-05'], [0.0001, '0.0001'], [1.5e16, '15000000000000000'], [1.5e17, '1.5e+17'],
    [12.3, '12.300000000000001'], [-12.3, '-12.300000000000001'],
  ];
  for (const [number, text] of swift) assert.equal(swiftNumber(number), text, String(number));
});

test('keys sort like JSONSerialization .sortedKeys', () => {
  const keys = ['b', 'a_b', 'ab', 'aB', 'A', 'a1', 'é', 'Z', 'z', 'a10', 'a9', 'x_2', 'x-1', 'x.1', 'X', 'x', 'log_lines', 'logs',
    'n', 'flow_g_per_s', 'flow', 'grams', 'seconds', 'Seconds', 'cleaned_grams', 'clean', '_x', '1a', 'é2', 'e', 'f', 'E'];
  const object = Object.fromEntries(keys.map((key) => [key, 1]));
  object.s = '\u001f\u0001';
  assert.equal(swiftJSON(object),
    '{"_x":1,"1a":1,"A":1,"a_b":1,"a1":1,"a9":1,"a10":1,"ab":1,"aB":1,"b":1,"clean":1,"cleaned_grams":1,"e":1,"E":1,"é":1,"é2":1,"f":1,"flow":1,"flow_g_per_s":1,"grams":1,"log_lines":1,"logs":1,"n":1,"s":"\\u001f\\u0001","seconds":1,"Seconds":1,"x":1,"X":1,"x_2":1,"x-1":1,"x.1":1,"z":1,"Z":1}');
  assert.equal(swiftJSON({ b: [true, null, 'x/y\n\t"\\'], a: { d: 0.1, c: [] } }),
    '{"a":{"c":[],"d":0.10000000000000001},"b":[true,null,"x/y\\n\\t\\"\\\\"]}');
});

test('matching is case and diacritic insensitive like Foundation', () => {
  // [text, part, localizedStandardContains, compare(.caseInsensitive, .diacriticInsensitive)]
  const swift = [
    ['Señor Café', 'senor', true, false], ['Straße', 'STRASSE', true, true], ['Straße', 'ss', true, false],
    ['ｆｕｌｌ', 'full', false, false], ['ﬁne', 'fi', true, false], ['Ærø', 'aero', false, false],
    ['İstanbul', 'istanbul', true, true], ['Ørsted', 'orsted', false, false], ['café', 'CAFÉ', true, true], ['x', '', false, false],
  ];
  for (const [text, part, contains, same] of swift) {
    assert.equal(containsFolded(text, part), contains, `${text} contains ${part}`);
    assert.equal(sameFolded(text, part), same, `${text} is ${part}`);
  }
});

test('trimming matches whitespacesAndNewlines', () => {
  assert.equal(trimmed('\u0085abc 　'), 'abc');
  assert.equal(trimmed(' \n '), null);
  assert.equal(trimmed(7), null);
});

test('dates are 24-hour local time', () => {
  const date = new Date('2027-01-15T00:05:09Z');
  assert.equal(dateText(date, 'UTC'), '2027-01-15 00:05:09');
  assert.equal(dateText(date, 'Asia/Tokyo'), '2027-01-15 09:05:09');
  assert.equal(dateText(date, 'America/Los_Angeles'), '2027-01-14 16:05:09');
});
