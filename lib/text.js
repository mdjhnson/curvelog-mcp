// Text helpers that behave like the Foundation calls the Swift helper uses, so both answer alike.

// Swift's CharacterSet.whitespacesAndNewlines: every space separator, line and paragraph
// separator, tab through carriage return, and U+0085. JavaScript's trim() leaves out U+0085 and
// adds U+FEFF, so it isn't quite the same.
const edges = /^[\p{Z}\u0009-\u000D\u0085]+|[\p{Z}\u0009-\u000D\u0085]+$/gu;

/** A string argument, trimmed; nil (null) when it isn't a string or is empty. */
export function trimmed(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(edges, '');
  return text === '' ? null : text;
}

/** Case-insensitive, like Swift's caseInsensitiveCompare(_:) == .orderedSame. */
export function sameIgnoringCase(a, b) {
  return a.toUpperCase().toLowerCase() === b.toUpperCase().toLowerCase();
}

/** Case and diacritic folded: "Señor Café" and "SENOR CAFE" fold alike, and so do "ß" and "SS". */
export function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().toLowerCase();
}

/** Swift's compare(_:options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame. */
export function sameFolded(a, b) {
  return fold(a) === fold(b);
}

/** Swift's localizedStandardContains(_:): case and diacritic insensitive. */
export function containsFolded(text, part) {
  const needle = fold(part);
  return needle !== '' && fold(text).includes(needle);
}

const formatters = new Map();

/** `2027-01-15 07:00:00`: 24-hour time in the given time zone (the computer's own when undefined). */
export function dateText(date, timeZone) {
  const key = timeZone ?? '';
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(key, formatter);
  }
  const part = {};
  for (const { type, value } of formatter.formatToParts(date)) part[type] = value;
  return `${part.year.padStart(4, '0')}-${part.month}-${part.day} ${part.hour}:${part.minute}:${part.second}`;
}

// The order JSONSerialization's .sortedKeys puts keys in: numbers by value, lower case first.
const keyOrder = new Intl.Collator('en', { numeric: true });

function compareKeys(a, b) {
  return keyOrder.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * JSON written the way Swift's JSONSerialization writes it with [.sortedKeys, .withoutEscapingSlashes]:
 * compact, keys sorted at every level, and fractions printed as C's %.17g (0.1 becomes
 * 0.10000000000000001).
 */
export function swiftJSON(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return swiftNumber(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(swiftJSON).join(',') + ']';
  const keys = Object.keys(value).sort(compareKeys);
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + swiftJSON(value[key])).join(',') + '}';
}

/** A number as JSONSerialization prints it: whole numbers as they are, anything else as %.17g. */
export function swiftNumber(n) {
  if (Object.is(n, -0)) return '-0';
  if (Number.isSafeInteger(n)) return String(n);
  const [mantissa, exponentText] = n.toExponential(16).split('e');
  const exponent = Number(exponentText);
  const sign = mantissa.startsWith('-') ? '-' : '';
  const digits = mantissa.replace('-', '').replace('.', '');
  if (exponent < -4 || exponent >= 17) {
    const power = String(Math.abs(exponent)).padStart(2, '0');
    return `${sign}${withFraction(digits[0], digits.slice(1))}e${exponent < 0 ? '-' : '+'}${power}`;
  }
  if (exponent >= 0) return sign + withFraction(digits.slice(0, exponent + 1), digits.slice(exponent + 1));
  return sign + withFraction('0', '0'.repeat(-exponent - 1) + digits);
}

/** %g leaves out a fraction's trailing zeros, and the point when nothing's left after it. */
function withFraction(whole, fraction) {
  const kept = fraction.replace(/0+$/, '');
  return kept === '' ? whole : `${whole}.${kept}`;
}
