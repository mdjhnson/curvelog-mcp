// End to end: start server.js the way an AI app does and talk to it over stdin and stdout.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';
import { missingText } from '../lib/tools.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(here, '..', 'server.js');
const temp = mkdtempSync(path.join(tmpdir(), 'curvelog-mcp-e2e-'));
after(() => rmSync(temp, { recursive: true, force: true }));

const root = path.join(temp, 'Curvelog');
const device = path.join(root, 'AI apps', 'iPhone-TEST');
mkdirSync(device, { recursive: true });
// An old copy, so the stale note shows.
const snapshot = JSON.parse(readFileSync(path.join(here, 'fixtures', 'snapshot.json'), 'utf8'));
snapshot.generatedAt = '2026-01-02T08:00:00Z';
writeFileSync(path.join(device, 'snapshot.json'), JSON.stringify(snapshot));
cpSync(path.join(here, 'fixtures', 'curves.json'), path.join(device, 'curves.json'));

/** Sends the lines, closes stdin and collects every reply line and stderr. HOME is a temp folder. */
function run(args, lines) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [server, ...args], { env: { PATH: process.env.PATH, TZ: 'UTC', HOME: temp, USERPROFILE: temp } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, replies: stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line)), stderr }));
    child.stdin.end(lines.join('\n') + '\n');
  });
}

test('initialize and tools/call over stdio', async () => {
  const { version } = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
  const { code, replies, stderr } = await run(['--dir', root], [
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}',
    '{"jsonrpc":"2.0","method":"notifications/initialized"}',
    '',
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}',
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_dial_in","arguments":{"coffee":"guji","method":"v60"}}}',
    '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_brew_curve","arguments":{"brew_id":"6F1D2A10-0000-4000-8000-000000000021"}}}',
    'not json',
  ]);
  assert.equal(code, 0);
  assert.deepEqual(replies.map((reply) => reply.id), [1, 2, 3, 4, null]);
  assert.equal(replies[0].result.protocolVersion, '2025-06-18');
  assert.deepEqual(replies[0].result.serverInfo, { name: 'curvelog', title: 'Curvelog', version });
  assert.ok(replies[0].result.instructions.startsWith('How to read my log: made up for the tests.\n\n'));
  assert.equal(replies[1].result.tools.length, 5);
  assert.equal(replies[2].result.content[0].text,
    'Guji on V60 dial-in.\n\n(Curvelog last updated this copy on 2026-01-02 08:00:00. Brews logged since then show up once Curvelog is opened on your iPhone or iPad.)');
  assert.equal(replies[2].result.isError, false);
  assert.equal(replies[3].result.content[0].text,
    '{"id":"6F1D2A10-0000-4000-8000-000000000021","mode":"espresso","points":[{"grams":0,"seconds":0},{"grams":36,"seconds":28}]}');
  assert.equal(replies[4].error.code, -32700);
  assert.ok(stderr.includes(`reading ${device}`));
});

test('with no copy, a tool says how to share one', async () => {
  const { replies } = await run(['--dir', path.join(temp, 'nothing-here')], [
    '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_recent_brews","arguments":{}}}',
  ]);
  // HOME is a temp folder, so this computer's own iCloud Drive isn't found either.
  assert.deepEqual(replies, [{ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: missingText }], isError: true } }]);
});
