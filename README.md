# curvelog-mcp

Ask an AI app on your computer about the coffee you've brewed. This small helper lets Claude Desktop, the ChatGPT desktop app and other apps that use MCP (Model Context Protocol) read the brews you logged in [Curvelog](https://oakhouselabs.com/curvelog/).

It's an unofficial helper for Curvelog. Curvelog works with the MAVO Lumicurve and BOOKOO Themis Ultra scales and is not affiliated with MAVO or BOOKOO.

- **It only reads.** Nothing it does changes Curvelog or your brews.
- **It makes no network calls.** It reads files on your computer and nothing else. The AI app you connect it to may send what it reads to that app's own service, as it does with anything else you ask it. If you set it up with `npx` (step 4), `npx` downloads the helper from GitHub when the app starts it; the helper itself still makes no network calls.

On a Mac with Curvelog for Mac, you don't need this: Curvelog for Mac has the same helper built in (Settings → AI apps). This one is for Windows, and for a Mac without Curvelog for Mac.

## Set it up

### 1. Turn on the copy in Curvelog

In Curvelog on your iPhone or iPad, go to Settings → AI apps and turn on **Keep a copy for AI apps on a computer**. This needs Curvelog Pro. Curvelog then keeps a copy of your brews in iCloud Drive and updates it while Curvelog is open.

### 2. Get iCloud Drive on your computer

- **Windows:** install iCloud for Windows from the Microsoft Store, sign in with the same Apple Account as your iPhone, and turn on iCloud Drive. The copy appears under iCloud Drive in a Curvelog folder.
- **Mac:** it's in iCloud Drive already. There's nothing to install.

### 3. Claude Desktop

Download `curvelog.mcpb` from this project's [Releases page](https://github.com/mdjhnson/curvelog-mcp/releases) and double-click it. You can also open Claude Desktop's Settings → Extensions and install it from there. Then ask Claude something like "What did I brew this week?"

This is the best way for Claude Desktop: everything the helper needs is in that one file, so nothing is downloaded when Claude starts it, and you don't need to install Node.js.

### 4. The ChatGPT desktop app and other MCP apps

Apps that run local MCP servers start this helper with Node.js, so install Node.js from [nodejs.org](https://nodejs.org) first (version 18 or newer). Then add this to the app's MCP settings:

```json
{
  "mcpServers": {
    "curvelog": {
      "command": "npx",
      "args": ["-y", "github:mdjhnson/curvelog-mcp#v1.0.0"]
    }
  }
}
```

When the app starts the helper, `npx` downloads it from GitHub (the `v1.0.0` release named in the settings), so your computer needs the internet at that moment. The helper itself makes no network calls once it's running.

If your iCloud Drive isn't in the usual place, add `--dir` and the folder:

```json
"args": ["-y", "github:mdjhnson/curvelog-mcp#v1.0.0", "--dir", "D:\\iCloudDrive\\Curvelog"]
```

ChatGPT on the web can only reach servers on the internet, so it can't use this helper. Instead, export a brew's curve as JSON from Curvelog and attach the file to your chat.

## What the AI app can ask for

| Tool | What it gives |
| --- | --- |
| `list_recent_brews` | Your newest brews: date, coffee, method, recipe, taste and each brew's id. |
| `get_brew` | One brew in full: numbers, pours, taste, the coffee, the brews before it and Curvelog's advice for next time. |
| `find_coffees` | Your coffees by name or roaster, with the methods each was brewed with. |
| `get_dial_in` | A coffee on one brew method: every brew so far, what Curvelog noticed and its plan for the next brew. |
| `get_brew_curve` | The scale readings behind one recent brew's curve, as JSON. |

Hidden brews are left out.

## If something's wrong

**"Curvelog hasn't shared any brews to iCloud Drive yet."** The helper didn't find the copy. Check that Keep a copy for AI apps on a computer is on in Curvelog, that iCloud Drive is on and finished syncing, and that you can see a Curvelog folder with an "AI apps" folder inside it in iCloud Drive.

**The answers are missing your latest brews.** Curvelog updates the copy while it's open. Open Curvelog on your iPhone or iPad and wait a moment for iCloud Drive to sync. When the copy is more than an hour old, the helper says when it was made.

**"Curvelog's copy is in iCloud Drive but isn't downloaded to this Mac yet."** macOS can remove files from your Mac that it thinks you don't need, and keep them only in iCloud. In Finder, open iCloud Drive → Curvelog → AI apps once, or right-click the folder and choose Download Now.

**"Curvelog's copy in iCloud Drive couldn't be read."** The copy may be halfway through syncing, so try again in a moment. If it keeps happening, Curvelog may be writing a newer kind of copy than this helper knows: update the helper.

**Your iCloud Drive is somewhere else.** Tell the helper where the Curvelog folder is. In Claude Desktop, open the extension's settings and pick the folder. In other apps, add `--dir` and the folder, as shown above. You can pick the Curvelog folder, its "AI apps" folder, or one device's folder inside that. Setting `CURVELOG_DIR` to the folder works too. A folder that doesn't start at the top of a drive is looked for in your home folder.

## For developers

No dependencies. It needs Node.js 18 or newer and uses only what comes with it.

```sh
npm test                       # runs every test with node --test
node server.js --dir <folder>  # speaks MCP on stdin and stdout; notes go to stderr
npm run pack                   # validates manifest.json and builds curvelog.mcpb
```

`npm run pack` uses the [MCPB](https://github.com/modelcontextprotocol/mcpb) command-line tool through `npx`, so it downloads that tool the first time.

### Where it looks

Curvelog on each iPhone or iPad writes `AI apps/<device>/snapshot.json` and `curves.json` into its iCloud Drive folder. The helper reads the device folder whose `snapshot.json` has the newest `generatedAt`. It looks in, first match wins:

1. `--dir <folder>` or `CURVELOG_DIR`
2. On a Mac: `~/Library/Mobile Documents/iCloud~com~mattofmatts~curvelog~app/Documents`
3. On Windows: a folder with "curvelog" in its name inside `%USERPROFILE%\iCloudDrive` that has `AI apps` in it

It looks again on every call and keeps nothing between calls, so a copy that iCloud Drive rewrites is read at once.

### The contract with Curvelog

The tools' answers match Curvelog's own Swift helper word for word, except where they say where the copy comes from. `test/fixtures` is a copy of Curvelog's `Tests/Fixtures/mcp`: a made-up `snapshot.json`, its `curves.json`, and `cases.json` with each tool call and the exact text Curvelog's tests expect (with the time zone UTC and "now" set to the snapshot's `generatedAt`). `test/golden.test.js` runs every case here. When the Swift tools' text changes, copy the three files over again and make the tests pass.

### Files

- `server.js` reads lines from stdin and writes replies to stdout
- `lib/protocol.js` handles JSON-RPC: `initialize`, `ping`, `tools/list` and `tools/call`
- `lib/tools.js` has the five tools and their text
- `lib/snapshot.js` reads and checks `snapshot.json`
- `lib/find.js` finds the copy in iCloud Drive
- `lib/text.js` has small text helpers that match Swift's Foundation
- `manifest.json` describes the Claude Desktop extension

## License

MIT. See [LICENSE](LICENSE).
