// Reads snapshot.json, the copy of a person's brews that Curvelog writes for AI apps.
//
// It checks the file the way the Swift helper's JSONDecoder does: a field that must be there and
// isn't, or has the wrong type, makes the whole file unreadable (null), and the tools then say
// the copy couldn't be read. Unknown fields are ignored. A newer format than this helper knows is
// unreadable too.

import { isObject } from './text.js';

/** The newest snapshot format this helper reads. */
export const formatVersion = 1;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO 8601 with a time zone. Curvelog writes no fractions of a second; they're accepted anyway.
const datePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|([+-])(\d{2}):?(\d{2}))$/;
const lockReasons = ['needsPro', 'turnedOff'];

class Unreadable extends Error {}

/** The snapshot with dates as Date objects and ids in upper case (Swift's uuidString), or null. */
export function decodeSnapshot(text) {
  let file;
  try {
    file = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return null;
  }
  try {
    const top = object(file);
    if (int(top.formatVersion) > formatVersion) return null;
    const locked = optional(top.locked, (value) => {
      if (!lockReasons.includes(value)) throw new Unreadable();
      return value;
    });
    return {
      formatVersion: int(top.formatVersion),
      generatedAt: date(top.generatedAt),
      locked,
      instructions: string(top.instructions),
      brews: array(top.brews).map(brewEntry),
      coffees: array(top.coffees).map(coffeeEntry),
      dialIns: array(top.dialIns).map(dialInEntry),
    };
  } catch (error) {
    if (error instanceof Unreadable) return null;
    throw error;
  }
}

function brewEntry(value) {
  const entry = object(value);
  return {
    id: uuid(entry.id),
    date: optional(entry.date, date),
    coffee: optional(entry.coffee, string),
    roaster: optional(entry.roaster, string),
    method: optional(entry.method, string),
    mode: string(entry.mode),
    recipe: string(entry.recipe),
    taste: optional(entry.taste, string),
    rating: optional(entry.rating, int),
    summary: optional(entry.summary, string),
  };
}

function coffeeEntry(value) {
  const entry = object(value);
  return {
    id: uuid(entry.id),
    name: string(entry.name),
    roaster: optional(entry.roaster, string),
    archived: bool(entry.archived),
    methods: array(entry.methods).map(string),
  };
}

function dialInEntry(value) {
  const entry = object(value);
  return {
    coffeeID: uuid(entry.coffeeID),
    methodID: uuid(entry.methodID),
    coffee: string(entry.coffee),
    method: string(entry.method),
    brewCount: int(entry.brewCount),
    lastBrew: optional(entry.lastBrew, date),
    summary: string(entry.summary),
  };
}

function optional(value, decode) {
  return value === undefined || value === null ? null : decode(value);
}

function object(value) {
  if (!isObject(value)) throw new Unreadable();
  return value;
}

function array(value) {
  if (!Array.isArray(value)) throw new Unreadable();
  return value;
}

function string(value) {
  if (typeof value !== 'string') throw new Unreadable();
  return value;
}

function bool(value) {
  if (typeof value !== 'boolean') throw new Unreadable();
  return value;
}

function int(value) {
  if (!Number.isInteger(value)) throw new Unreadable();
  return value;
}

function uuid(value) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) throw new Unreadable();
  return value.toUpperCase();
}

/** An ISO 8601 date. An impossible one (February 30, 24:00, 12:60) is unreadable. */
function date(value) {
  const parts = typeof value === 'string' ? datePattern.exec(value) : null;
  if (!parts) throw new Unreadable();
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  utc.setUTCHours(hour, minute, second, 0);
  // Date rolls an impossible date over to a real one (February 30 to March 2); it must come back as written.
  const roundTrip = [utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds()];
  if (roundTrip.some((field, i) => field !== [year, month, day, hour, minute, second][i])) throw new Unreadable();
  const milliseconds = parts[7] ? Math.floor(Number('0' + parts[7]) * 1000) : 0;
  const offset = parts[8] === 'Z' ? 0 : (parts[9] === '-' ? -1 : 1) * (Number(parts[10]) * 60 + Number(parts[11])) * 60_000;
  return new Date(utc.getTime() + milliseconds - offset);
}
