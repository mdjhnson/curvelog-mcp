// Shared by the tests: the golden fixtures, decoded.

import { readFileSync } from 'node:fs';
import { decodeSnapshot } from '../lib/snapshot.js';

export const fixtureText = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
export const fixtureSnapshot = () => decodeSnapshot(fixtureText('snapshot.json'));
export const newest = '6F1D2A10-0000-4000-8000-000000000021';

export function input(snapshot = fixtureSnapshot(), now = snapshot?.generatedAt ?? new Date()) {
  return { snapshot, curves: () => fixtureText('curves.json'), now, timeZone: 'UTC' };
}

export function locked(reason) {
  return { ...fixtureSnapshot(), locked: reason, instructions: '', brews: [], coffees: [], dialIns: [] };
}
