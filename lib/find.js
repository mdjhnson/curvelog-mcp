// Finds the copy of Curvelog's brews in iCloud Drive.
//
// Curvelog on an iPhone or iPad writes `<root>/AI apps/<device folder>/snapshot.json` and
// `curves.json`, one device folder per iPhone or iPad. The copy with the newest `generatedAt`
// wins. The root is, first match wins:
//   1. --dir or CURVELOG_DIR: the root, the "AI apps" folder, or one device folder.
//   2. On a Mac: Curvelog's iCloud Drive folder in ~/Library/Mobile Documents.
//   3. On Windows: a folder with "curvelog" in its name inside %USERPROFILE%\iCloudDrive that
//      has "AI apps" in it. iCloud for Windows may name it "Curvelog" or after the container.
//
// Nothing is cached: it's cheap, and a copy that turns up later is found on the next call. On
// Windows the files may be iCloud placeholders; reading one downloads it. On a Mac, iCloud Drive
// can evict a file it thinks isn't needed, leaving `.snapshot.json.icloud` in its place, and
// reading that doesn't download it; the tools then say how to download it in Finder.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { decodeSnapshot } from './snapshot.js';

export const aiAppsName = 'AI apps';
export const snapshotName = 'snapshot.json';
export const curvesName = 'curves.json';
export const macContainer = 'iCloud~com~mattofmatts~curvelog~app';

/** The iCloud placeholder Finder leaves for a file it has evicted from a Mac. */
export const placeholderName = (name) => `.${name}.icloud`;

/**
 * The folder given with --dir <path>, --dir=<path> or CURVELOG_DIR, or null. A Claude Desktop
 * extension passes "${user_config.folder}" as it is when the setting is left empty, so that
 * counts as not set. Quotes around it and line breaks at its ends, easy to paste in by mistake,
 * are taken off; spaces are kept, as a folder's name can end in one.
 */
export function chosenDir(args, env) {
  let value = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && i + 1 < args.length) value = args[i + 1];
    else if (args[i].startsWith('--dir=')) value = args[i].slice('--dir='.length);
  }
  value = cleaned(value);
  if (value === null) value = cleaned(env.CURVELOG_DIR);
  return value;
}

function cleaned(value) {
  if (typeof value !== 'string') return null;
  let text = value.replace(/^[\r\n]+|[\r\n]+$/g, '');
  const quoted = /^(["'])(.*)\1$/s.exec(text);
  if (quoted) text = quoted[2];
  if (text.trim() === '' || text.startsWith('${user_config.')) return null;
  return text;
}

/**
 * Groups of folders to look in, in order. Within a group the newest copy wins; the first group
 * with a copy is used.
 */
export function placesToLook({ dir = null, platform = process.platform, home = homedir(), env = process.env } = {}) {
  const groups = [];
  // An AI app may start the server in any folder, so a relative path starts at the home folder.
  if (dir) groups.push([path.resolve(home, expandHome(dir, home))]);
  if (platform === 'darwin') {
    groups.push([path.join(home, 'Library', 'Mobile Documents', macContainer, 'Documents')]);
  }
  if (platform === 'win32') {
    const drive = path.join(env.USERPROFILE || home, 'iCloudDrive');
    const found = subfolders(drive)
      .filter((folder) => path.basename(folder).toLowerCase().includes('curvelog'))
      .filter((folder) => isDirectory(path.join(folder, aiAppsName)));
    if (found.length > 0) groups.push(found);
  }
  return groups;
}

/**
 * The copy to read: `{ folder, snapshot, problem: null }` with the decoded snapshot. A readable
 * copy anywhere wins. With none, `{ folder: null, snapshot: null, problem }` says why when a copy
 * is there but can't be used: 'notDownloaded' (only an iCloud placeholder, which says how to fix
 * it) before 'unreadable' (a snapshot.json that can't be read or decoded). Null when there's
 * nothing at all. `log` gets a line for each copy that can't be used.
 */
export function findCopy(options = {}) {
  const log = options.log ?? (() => {});
  const problems = new Set();
  for (const group of placesToLook(options)) {
    let best = null;
    for (const folder of group.flatMap(deviceFolders)) {
      const file = path.join(folder, snapshotName);
      const text = readText(file);
      if (text === null) {
        if (isFile(file)) {
          problems.add('unreadable');
          log(`curvelog-mcp: can't read ${file}`);
        } else if (isFile(path.join(folder, placeholderName(snapshotName)))) {
          problems.add('notDownloaded');
          log(`curvelog-mcp: ${file} is in iCloud Drive but not downloaded`);
        }
        continue;
      }
      const snapshot = decodeSnapshot(text);
      if (!snapshot) {
        problems.add('unreadable');
        log(`curvelog-mcp: can't read ${file}`);
        continue;
      }
      if (!best || snapshot.generatedAt > best.snapshot.generatedAt) best = { folder, snapshot, problem: null };
    }
    if (best) return best;
  }
  for (const problem of ['notDownloaded', 'unreadable']) {
    if (problems.has(problem)) return { folder: null, snapshot: null, problem };
  }
  return null;
}

/**
 * curves.json's text from a device folder; { problem: 'notDownloaded' } when only its iCloud
 * placeholder is there; null when it isn't there or can't be read.
 */
export function readCurves(folder) {
  const text = readText(path.join(folder, curvesName));
  if (text !== null) return text;
  return isFile(path.join(folder, placeholderName(curvesName))) ? { problem: 'notDownloaded' } : null;
}

/** A device folder as it is, the device folders in a root's "AI apps", or those in "AI apps" itself. */
function deviceFolders(place) {
  if (isFile(path.join(place, snapshotName)) || isFile(path.join(place, placeholderName(snapshotName)))) return [place];
  const aiApps = path.join(place, aiAppsName);
  return subfolders(isDirectory(aiApps) ? aiApps : place);
}

function subfolders(folder) {
  let names;
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  return names.sort().map((name) => path.join(folder, name)).filter(isDirectory);
}

function expandHome(dir, home) {
  if (dir === '~') return home;
  if (dir.startsWith('~/') || dir.startsWith('~\\')) return path.join(home, dir.slice(2));
  return dir;
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function isDirectory(place) {
  return stat(place)?.isDirectory() ?? false;
}

function isFile(place) {
  return stat(place)?.isFile() ?? false;
}

function stat(place) {
  try {
    return statSync(place, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}
