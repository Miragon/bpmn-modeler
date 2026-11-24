import { describe, expect, it } from "vitest";

import type { SurfaceMode } from "@miragon/bpmn-modeler-types/domain";

import { type HostModeOffer, modeEntry, type ModeEntry } from "./modeEntry";

describe("modeEntry", () => {
    it.each<{
        name: string;
        host: HostModeOffer | undefined;
        saved: SurfaceMode | undefined;
        entry: ModeEntry;
    }>([
        {
            name: "asks for the saved mode over the host's default",
            host: { defaultMode: "view" },
            saved: "design",
            entry: { showsModeSwitch: true, requestedMode: "design" },
        },
        {
            name: "asks for the host's default when nothing is saved",
            host: { defaultMode: "view" },
            saved: undefined,
            entry: { showsModeSwitch: true, requestedMode: "view" },
        },
        {
            name: "asks for nothing when neither is set",
            host: {},
            saved: undefined,
            entry: { showsModeSwitch: true, requestedMode: null },
        },
        {
            name: "offers the switch when the host says it does",
            host: { modeSwitch: true, defaultMode: "view" },
            saved: "design",
            entry: { showsModeSwitch: true, requestedMode: "design" },
        },
        {
            name: "offers the switch and asks for the saved mode before the host answers",
            host: undefined,
            saved: "view",
            entry: { showsModeSwitch: true, requestedMode: "view" },
        },
        {
            name: "hides the switch and asks for nothing when the host offers none",
            host: { modeSwitch: false, defaultMode: "view" },
            saved: "design",
            entry: { showsModeSwitch: false, requestedMode: null },
        },
        {
            name: "hides the switch and asks for nothing without a saved mode",
            host: { modeSwitch: false },
            saved: undefined,
            entry: { showsModeSwitch: false, requestedMode: null },
        },
    ])("$name", ({ host, saved, entry }) => {
        expect(modeEntry(host, saved)).toEqual(entry);
    });
});
