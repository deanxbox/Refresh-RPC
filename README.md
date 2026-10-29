# Refresh-RPC

A [Vencord](https://vencord.dev) userplugin that remembers Rich Presence sent by your local apps and restores it after Discord reloads or restarts, so you don't have to restart those apps.

## The problem

Apps such as media players, game launchers and Seanime send Rich Presence to Discord's local RPC server. When Discord's renderer reloads (rebuilding Vencord, reloading with Ctrl+R, restarting the client), the presence state is lost and the apps don't know to resend it. You then have to restart each app to get its presence back.

## How it works

1. Every `LOCAL_ACTIVITY_UPDATE` event dispatched on Discord's Flux dispatcher is observed.
2. Activities that carry a `socketId` are saved per socket, including details, state, timestamps and assets. They're stored with Vencord's `DataStore` (IndexedDB), so they survive reloads.
3. When the client connects (`CONNECTION_OPEN`), or when the plugin is enabled mid-session, the saved activities are dispatched again.
4. If an app clears its presence, the saved entry is deleted. Clears that arrive while the page is unloading, or within 5 seconds after a reconnect, are treated as teardown noise and ignored.

Replayed events are tagged so the plugin never re-captures its own replays.

## Installation

Vencord must be built from source to use userplugins. See the [Vencord custom plugins guide](https://docs.vencord.dev/installing/custom-plugins/).

```sh
cd Vencord/src/userplugins
git clone https://github.com/deanxbox/Refresh-RPC.git
cd ../..
pnpm build
```

Restart Discord, then enable **Refresh-RPC** under Settings → Vencord → Plugins.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `maxAgeMinutes` | `720` | Saved presences older than this are discarded on reconnect. This limits stale presences from apps closed while Discord was down. |
| `ignoredSocketIds` | `CustomRPC,LastFM,FakeActivity` | Comma-separated socket IDs that are never remembered, because those plugins resend their own presence. |
| `debugLog` | `false` | Logs each captured, cleared and replayed activity (details and state) to the console. |

## Troubleshooting

Turn on `debugLog` and open the DevTools console (look for `Refresh-RPC`):

- A `replay` line followed by a later `capture` with different text means the app itself is overwriting the restored presence after Discord reconnects. The plugin can't prevent that without hiding real updates from the app.
- A `replay` line that already shows the wrong text means the wrong state was saved. Open an issue with the log lines.

## Limitations

- **Stale presences:** the renderer can't see which processes are running. If an app is closed while Discord is down, its last presence can reappear until `maxAgeMinutes` passes.
- **Timestamps:** saved timestamps are replayed as-is, so an elapsed timer may look slightly off after a reload.
- **Per-socket storage:** only the latest activity per `socketId` is kept.
- **Untested at runtime:** it typechecks and builds, but the reload behaviour hasn't been verified in a live Discord client yet.

## Development

```sh
node node_modules/typescript/bin/tsc --noEmit
node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs
```

Run these from the Vencord root.

## License

GPL-3.0-or-later, matching Vencord.

