// The protocol, as Curvelog's MCPServerTests check it.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handle, handleSafely, instructionsText, protocolVersions } from '../lib/protocol.js';
import { definitions } from '../lib/tools.js';
import { fixtureSnapshot, input, locked } from './helpers.js';

function send(line, snapshot = fixtureSnapshot()) {
  const reply = handle(line, { version: '1.0.0', input: () => input(snapshot) });
  assert.ok(reply !== null);
  assert.ok(!reply.includes('\n'));
  return JSON.parse(reply);
}

test('initialize agrees on a version and gives the opening', () => {
  const reply = send('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}');
  assert.equal(reply.id, 1);
  assert.equal(reply.result.protocolVersion, '2025-06-18');
  assert.equal(reply.result.instructions, 'How to read my log: made up for the tests.\n\n' + instructionsText);
  assert.deepEqual(reply.result.capabilities, { tools: {} });
  assert.deepEqual(reply.result.serverInfo, { name: 'curvelog', title: 'Curvelog', version: '1.0.0' });

  const unknown = send('{"jsonrpc":"2.0","id":2,"method":"initialize","params":{"protocolVersion":"1999-01-01"}}');
  assert.equal(unknown.result.protocolVersion, protocolVersions[0]);
  const none = send('{"jsonrpc":"2.0","id":3,"method":"initialize"}');
  assert.equal(none.result.protocolVersion, '2025-11-25');
});

test('a locked or missing copy leaves out the opening', () => {
  for (const snapshot of [locked('needsPro'), locked('turnedOff'), null]) {
    const reply = send('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}', snapshot);
    assert.equal(reply.result.instructions, instructionsText);
  }
});

test('notifications get no reply', () => {
  const options = { version: '1', input: () => input() };
  assert.equal(handle('{"jsonrpc":"2.0","method":"notifications/initialized"}', options), null);
  assert.equal(handle('{"jsonrpc":"2.0","id":null,"method":"ping"}', options), null);
});

test('bad messages get errors with their ids', () => {
  const parse = send('not json');
  assert.equal(parse.error.code, -32700);
  assert.equal(parse.id, null);
  assert.equal(send('[1,2]').error.code, -32700);

  const method = send('{"jsonrpc":"2.0","id":"a","method":"resources/list"}');
  assert.equal(method.error.code, -32601);
  assert.equal(method.error.message, 'Method not found: resources/list');
  assert.equal(method.id, 'a');

  const noMethod = send('{"jsonrpc":"2.0","id":7}');
  assert.equal(noMethod.error.code, -32600);
  assert.equal(noMethod.id, 7);

  const noName = send('{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{}}');
  assert.equal(noName.error.code, -32602);
  assert.equal(noName.id, 8);
});

test('ping answers with an empty result', () => {
  assert.deepEqual(send('{"jsonrpc":"2.0","id":5,"method":"ping"}'), { jsonrpc: '2.0', id: 5, result: {} });
});

test('tools are listed read-only', () => {
  const { tools } = send('{"jsonrpc":"2.0","id":3,"method":"tools/list"}').result;
  assert.deepEqual(tools.map((tool) => tool.name),
    ['list_recent_brews', 'get_brew', 'find_coffees', 'get_dial_in', 'get_brew_curve']);
  assert.ok(tools.every((tool) => tool.annotations.readOnlyHint === true && tool.annotations.openWorldHint === false));
  assert.deepEqual(tools, definitions);
  assert.deepEqual(tools[0].inputSchema.properties.count,
    { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'How many brews, 1 to 50.' });
  assert.deepEqual(tools[3].inputSchema.required, ['coffee', 'method']);
  assert.equal(tools[1].inputSchema.required, undefined);
});

test('tools/call returns text and isError', () => {
  const ok = send('{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_brew","arguments":{}}}');
  assert.deepEqual(ok.result, { content: [{ type: 'text', text: 'This brew: Señor Café espresso in full.' }], isError: false });

  const bad = send('{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_brew","arguments":{"brew_id":"nope"}}}');
  assert.equal(bad.result.isError, true);

  const noArguments = send('{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"list_recent_brews"}}');
  assert.ok(noArguments.result.content[0].text.startsWith('The newest 3 brews'));
});

test('an exception becomes -32603 for its id, and nothing for a notification', () => {
  const options = { version: '1', input: () => { throw new Error('boom'); } };
  const logged = [];
  const log = (text) => logged.push(text);
  const reply = JSON.parse(handleSafely('{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get_brew"}}', options, log));
  assert.deepEqual(reply, { jsonrpc: '2.0', id: 9, error: { code: -32603, message: 'Internal error' } });
  assert.equal(logged.length, 1);
  assert.ok(logged[0].includes('boom'));
  // A message that doesn't throw is answered as usual.
  assert.equal(JSON.parse(handleSafely('{"jsonrpc":"2.0","id":"p","method":"ping"}', options, log)).result.constructor, Object);
  assert.equal(JSON.parse(handleSafely('nope', options, log)).error.code, -32700);
});
