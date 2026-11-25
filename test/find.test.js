// Finding the copy in iCloud Drive, with made-up folders.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { chosenDir, findCopy, macContainer, readCurves } from '../lib/find.js';
import { fixtureText } from './helpers.js';

const temp = mkdtempSync(path.join(tmpdir(), 'curvelog-mcp-'));
after(() => rmSync(temp, { recursive: true, force: true }));
let made = 0;

/** A root with "AI apps/<device>/snapshot.json" for each device, generated at the given time. */
function makeRoot(devices, root = path.join(temp, `root-${++made}`)) {
  for (const [device, generatedAt] of Object.entries(devices)) {
    const folder = path.join(root, 'AI apps', device);
    mkdirSync(folder, { recursive: true });
    const snapshot = JSON.parse(fixtureText('snapshot.json'));
    snapshot.generatedAt = generatedAt;
    snapshot.instructions = device;
    writeFileSync(path.join(folder, 'snapshot.json'), JSON.stringify(snapshot));
    writeFileSync(path.join(folder, 'curves.json'), `{"brews":[],"device":"${device}"}`);
  }
  return root;
}

const nowhere = { platform: 'linux', home: path.join(temp, 'no-home'), env: {} };

test('--dir can be the root, the AI apps folder or one device folder', () => {
  const root = makeRoot({ 'iPhone-3F9A2C': '2027-01-15T08:00:00Z' });
  const device = path.join(root, 'AI apps', 'iPhone-3F9A2C');
  for (const dir of [root, path.join(root, 'AI apps'), device]) {
    const copy = findCopy({ ...nowhere, dir });
    assert.equal(copy?.folder, device, dir);
    assert.equal(copy.snapshot.instructions, 'iPhone-3F9A2C');
    assert.equal(readCurves(copy.folder), '{"brews":[],"device":"iPhone-3F9A2C"}');
  }
});

test('the newest generatedAt wins across devices', () => {
  const root = makeRoot({ 'iPad-AAAAAA': '2027-01-15T08:00:00Z', 'iPhone-BBBBBB': '2027-01-16T08:00:00Z', 'iPhone-CCCCCC': '2027-01-14T08:00:00Z' });
  assert.equal(findCopy({ ...nowhere, dir: root }).snapshot.instructions, 'iPhone-BBBBBB');
});

test('an unreadable snapshot is skipped and logged', () => {
  const root = makeRoot({ 'iPhone-A': '2027-01-15T08:00:00Z' });
  const broken = path.join(root, 'AI apps', 'iPhone-B');
  mkdirSync(broken);
  writeFileSync(path.join(broken, 'snapshot.json'), '{"generatedAt": "soon"}');
  const logged = [];
  const copy = findCopy({ ...nowhere, dir: root, log: (line) => logged.push(line) });
  assert.equal(copy.snapshot.instructions, 'iPhone-A');
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes('iPhone-B'));
});

test('on a Mac it looks in Curvelog\'s iCloud Drive folder', () => {
  const home = path.join(temp, 'mac-home');
  makeRoot({ 'iPhone-MAC': '2027-01-15T08:00:00Z' }, path.join(home, 'Library', 'Mobile Documents', macContainer, 'Documents'));
  assert.equal(findCopy({ platform: 'darwin', home, env: {} }).snapshot.instructions, 'iPhone-MAC');
  // Only on a Mac.
  assert.equal(findCopy({ platform: 'linux', home, env: {} }), null);
});

test('on Windows it looks for a Curvelog folder in iCloudDrive', () => {
  const profile = path.join(temp, 'windows-profile');
  const drive = path.join(profile, 'iCloudDrive');
  mkdirSync(path.join(drive, 'Documents'), { recursive: true });
  makeRoot({ 'iPhone-OLD': '2027-01-10T08:00:00Z' }, path.join(drive, 'Curvelog'));
  makeRoot({ 'iPhone-NEW': '2027-01-15T08:00:00Z' }, path.join(drive, 'iCloud~com~mattofmatts~curvelog~app'));
  // A folder with Curvelog in its name but no AI apps inside is passed over.
  mkdirSync(path.join(drive, 'Curvelog notes'));
  assert.equal(findCopy({ platform: 'win32', home: path.join(temp, 'elsewhere'), env: { USERPROFILE: profile } }).snapshot.instructions, 'iPhone-NEW');
  assert.equal(findCopy({ platform: 'win32', home: profile, env: {} }).snapshot.instructions, 'iPhone-NEW');
});

test('--dir comes first, and falls back when nothing is there', () => {
  const home = path.join(temp, 'mac-home-2');
  makeRoot({ 'iPhone-ICLOUD': '2027-01-20T08:00:00Z' }, path.join(home, 'Library', 'Mobile Documents', macContainer, 'Documents'));
  const chosen = makeRoot({ 'iPhone-CHOSEN': '2027-01-01T08:00:00Z' });
  assert.equal(findCopy({ platform: 'darwin', home, env: {}, dir: chosen }).snapshot.instructions, 'iPhone-CHOSEN');
  assert.equal(findCopy({ platform: 'darwin', home, env: {}, dir: path.join(temp, 'empty') }).snapshot.instructions, 'iPhone-ICLOUD');
});

test('nothing found is null', () => {
  assert.equal(findCopy(nowhere), null);
  assert.equal(findCopy({ ...nowhere, dir: path.join(temp, 'missing') }), null);
  assert.equal(findCopy({ ...nowhere, dir: makeRoot({}) }), null);
  assert.equal(findCopy({ platform: 'win32', home: path.join(temp, 'no-profile'), env: {} }), null);
});

test('the folder comes from --dir, then CURVELOG_DIR', () => {
  assert.equal(chosenDir(['--dir', '/a'], {}), '/a');
  assert.equal(chosenDir(['--dir=/b'], { CURVELOG_DIR: '/c' }), '/b');
  assert.equal(chosenDir([], { CURVELOG_DIR: '/c' }), '/c');
  assert.equal(chosenDir([], {}), null);
  // An extension's setting left empty arrives as the placeholder itself, or as nothing.
  assert.equal(chosenDir(['--dir', '${user_config.folder}'], {}), null);
  assert.equal(chosenDir(['--dir', ''], { CURVELOG_DIR: '/c' }), '/c');
  assert.equal(chosenDir(['--dir'], {}), null);
});
