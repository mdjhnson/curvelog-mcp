// Reads snapshot.json, the copy of a person's brews that Curvelog writes for AI apps.
//
// It checks the file the way the Swift helper's JSONDecoder does: a field that must be there and
// isn't, or has the wrong type, makes the whole file unreadable (null), and the tools then say
// there's no copy. Unknown fields are ignored.

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// ISO 8601 with a time zone. Curvelog writes no fractions of a second; they're accepted anyway.
const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
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
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Unreadable();
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

function date(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) throw new Unreadable();
  // "+0100" is ISO 8601 too, but Date.parse only knows "+01:00".
  const time = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isNaN(time)) throw new Unreadable();
  return new Date(time);
}
