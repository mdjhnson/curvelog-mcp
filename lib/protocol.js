// The Model Context Protocol over stdio, ported from Curvelog's MCPServer.swift.
//
// An AI app starts the server and writes JSON-RPC 2.0 messages to its standard input, one per line;
// each reply is one line on standard output. Only what a read-only tool server needs: initialize,
// ping, tools/list and tools/call. It holds no state between messages: every call looks for the
// copy afresh, so a copy that iCloud Drive rewrites while the AI app is open is seen at once.

import { isObject } from './text.js';
import { call, definitions } from './tools.js';

/** Newest first. The client's version is used when it's one of these. */
export const protocolVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export const instructionsText = 'These tools read the coffee brews logged in Curvelog, from the copy it keeps in iCloud Drive. They only read: nothing here changes Curvelog.';

/**
 * The reply to one line, or null for a notification (a message without an id).
 * `input` is a function returning the tools' input (see tools.js); it's called once per message
 * that needs it.
 */
export function handle(line, { version, input }) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    message = undefined;
  }
  if (!isObject(message)) {
    return encode({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  // A notification (notifications/initialized, notifications/cancelled) gets no reply.
  if (!('id' in message) || message.id === null) return null;
  const { id } = message;
  if (typeof message.method !== 'string') return error(id, -32600, 'Invalid request');
  const params = isObject(message.params) ? message.params : {};
  switch (message.method) {
    case 'initialize':
      return reply(id, initialize(params, version, input));
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: definitions });
    case 'tools/call': {
      if (typeof params.name !== 'string') return error(id, -32602, 'tools/call needs a name');
      const args = isObject(params.arguments) ? params.arguments : {};
      const result = call(params.name, args, input());
      return reply(id, { content: [{ type: 'text', text: result.text }], isError: result.isError });
    }
    default:
      return error(id, -32601, `Method not found: ${message.method}`);
  }
}

/**
 * handle(), but an exception never escapes: a request gets JSON-RPC's -32603 for its id, a
 * notification gets nothing, and `log` gets the error. The stdin loop uses this so one bad message
 * can't stop the server.
 */
export function handleSafely(line, options, log) {
  try {
    return handle(line, options);
  } catch (thrown) {
    log(`curvelog-mcp: ${thrown?.stack ?? thrown}`);
    let id = null;
    try {
      const message = JSON.parse(line);
      if (isObject(message)) id = message.id ?? null;
    } catch {
      // handle() answers lines that aren't JSON itself, so this isn't reached for them.
    }
    return id === null ? null : error(id, -32603, 'Internal error');
  }
}

function initialize(params, version, input) {
  const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : null;
  const { snapshot } = input();
  // A locked copy says nothing about the person's coffee, not even how to read it.
  const opening = snapshot && !snapshot.locked ? snapshot.instructions + '\n\n' : '';
  return {
    protocolVersion: protocolVersions.includes(asked) ? asked : protocolVersions[0],
    capabilities: { tools: {} },
    serverInfo: { name: 'curvelog', title: 'Curvelog', version },
    instructions: opening + instructionsText,
  };
}

function reply(id, result) {
  return encode({ jsonrpc: '2.0', id, result });
}

function error(id, code, message) {
  return encode({ jsonrpc: '2.0', id, error: { code, message } });
}

/** One line: JSON.stringify escapes newlines inside strings, so the message has none. */
function encode(message) {
  return JSON.stringify(message);
}
