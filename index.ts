/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher, UserStore } from "@webpack/common";

const logger = new Logger("Refresh-RPC");
const STORE_KEY = "Refresh-RPC_activities";
const REPLAY_FLAG = "__refreshRpc";

interface Saved { event: any; savedAt: number; }

const settings = definePluginSettings({
    maxAgeMinutes: {
        type: OptionType.NUMBER,
        description: "Discard remembered presences older than this many minutes (guards against apps closed while Discord was down)",
        default: 720
    },
    ignoredSocketIds: {
        type: OptionType.STRING,
        description: "Comma-separated socket IDs to never remember (plugin-driven presences re-send themselves)",
        default: "CustomRPC,LastFM,FakeActivity"
    },
    debugLog: {
        type: OptionType.BOOLEAN,
        description: "Log captured/replayed activities (details/state) to the console",
        default: false
    }
});

let saved: Record<string, Saved> = {};
let unloading = false;
let graceUntil = 0; // clears right after (re)connect are teardown noise, not an app ending its presence
let ready: Promise<void>;

const persist = () => set(STORE_KEY, saved).catch(e => logger.error("persist failed", e));
const onUnload = () => { unloading = true; };
const debug = (...a: any[]) => settings.store.debugLog && logger.info(...a);

function onActivity(e: any) {
    if (e[REPLAY_FLAG] || e.socketId == null) return;
    const id = String(e.socketId);
    if (settings.store.ignoredSocketIds.split(",").map(s => s.trim()).includes(id)) return;

    if (e.activity) debug("capture", id, e.activity.details, "|", e.activity.state);
    else debug("clear", id, unloading || Date.now() < graceUntil ? "(ignored)" : "");
    if (e.activity) saved[id] = { event: { type: e.type, socketId: e.socketId, pid: e.pid, activity: e.activity }, savedAt: Date.now() };
    else if (!unloading && Date.now() > graceUntil) delete saved[id]; // genuine clear; ignore teardown noise during reload
    else return;
    persist();
}

async function replay() {
    await ready;
    graceUntil = Date.now() + 5000;
    const cutoff = Date.now() - settings.store.maxAgeMinutes * 60_000;
    for (const [id, s] of Object.entries(saved)) {
        if (s.savedAt < cutoff) { delete saved[id]; continue; }
        debug("replay", id, s.event.activity?.details, "|", s.event.activity?.state);
        FluxDispatcher.dispatch({ ...s.event, [REPLAY_FLAG]: true });
    }
    persist();
}

export default definePlugin({
    name: "Refresh-RPC",
    description: "Remembers RPC activities sent by local apps and restores them after a Discord reload/restart, so apps don't need restarting",
    authors: [{ name: "Dean", id: 285021062578700289n }],
    settings,

    start() {
        unloading = false;
        ready = get<Record<string, Saved>>(STORE_KEY).then(v => { saved = { ...v, ...saved }; });
        window.addEventListener("beforeunload", onUnload);
        window.addEventListener("pagehide", onUnload);
        FluxDispatcher.subscribe("LOCAL_ACTIVITY_UPDATE", onActivity);
        FluxDispatcher.subscribe("CONNECTION_OPEN", replay);
        if (UserStore.getCurrentUser()) replay(); // enabled mid-session
    },

    stop() {
        window.removeEventListener("beforeunload", onUnload);
        window.removeEventListener("pagehide", onUnload);
        FluxDispatcher.unsubscribe("LOCAL_ACTIVITY_UPDATE", onActivity);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", replay);
    }
});



