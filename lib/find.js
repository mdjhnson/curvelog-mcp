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
// Windows the files may be iCloud placeholders; reading one downloads it, and a file that can't
// be read counts as not there.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { decodeSnapshot } from './snapshot.js';

export const aiAppsName = 'AI apps';
export const snapshotName = 'snapshot.json';
export const curvesName = 'curves.json';
export const macContainer = 'iCloud~com~mattofmatts~curvelog~app';

/**
 * The folder given with --dir <path>, --dir=<path> or CURVELOG_DIR, or null. A Claude Desktop
 * extension passes "${user_config.folder}" as it is when the setting is left empty, so that
 * counts as not set.
 */
export function chosenDir(args, env) {
  let value = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && i + 1 < args.length) value = args[i + 1];
    else if (args[i].startsWith('--dir=')) value = args[i].slice('--dir='.length);
  }
  if (!usable(value)) value = env.CURVELOG_DIR ?? null;
  return usable(value) ? value.trim() : null;
}

function usable(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.trim().startsWith('${user_config.');
}

/**
 * Groups of folders to look in, in order. Within a group the newest copy wins; the first group
 * with a copy is used.
 */
export function placesToLook({ dir = null, platform = process.platform, home = homedir(), env = process.env } = {}) {
  const groups = [];
  if (dir) groups.push([expandHome(dir, home)]);
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
 * The copy to read: `{ folder, snapshot }` with the decoded snapshot, or null when there's none.
 * `log` gets a line for each snapshot.json that's there but can't be read.
 */
export function findCopy(options = {}) {
  const log = options.log ?? (() => {});
  for (const group of placesToLook(options)) {
    let best = null;
    for (const folder of group.flatMap(deviceFolders)) {
      const text = readText(path.join(folder, snapshotName));
      if (text === null) continue;
      const snapshot = decodeSnapshot(text);
      if (!snapshot) {
        log(`curvelog-mcp: can't read ${path.join(folder, snapshotName)}`);
        continue;
      }
      if (!best || snapshot.generatedAt > best.snapshot.generatedAt) best = { folder, snapshot };
    }
    if (best) return best;
  }
  return null;
}

/** curves.json's text from a device folder, or null. */
export function readCurves(folder) {
  return readText(path.join(folder, curvesName));
}

/** A device folder as it is, the device folders in a root's "AI apps", or those in "AI apps" itself. */
function deviceFolders(place) {
  if (isFile(path.join(place, snapshotName))) return [place];
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
