import { describe, expect, it } from "vitest";

import { pluginConstructionFailureReport, pluginLoadReport } from "./pluginLoadReport";

describe("pluginLoadReport", () => {
    it("logs each plugin left out and shows one notice for them", () => {
        expect(
            pluginLoadReport({
                failures: [
                    { plugin: "Resize Tasks", reason: "boom" },
                    { plugin: "Tooltips", reason: "its script did not load (x.js)" },
                ],
                ignored: [],
            }),
        ).toEqual({
            logLines: [
                'BPMN plugin "Resize Tasks" left out: boom',
                'BPMN plugin "Tooltips" left out: its script did not load (x.js)',
            ],
            notice: "2 BPMN plugins could not be loaded and are left out. See the log for details.",
        });
    });

    it("only logs what a plugin registered that the editor cannot run", () => {
        expect(
            pluginLoadReport({ failures: [], ignored: [{ plugin: "Comments", type: "client" }] }),
        ).toEqual({
            logLines: ['BPMN plugin "Comments" registers "client", which this editor does not run'],
            notice: undefined,
        });
    });

    it("says nothing when every plugin loaded", () => {
        expect(pluginLoadReport({ failures: [], ignored: [] })).toEqual({
            logLines: [],
            notice: undefined,
        });
    });

    it("names one plugin left out in the singular", () => {
        expect(
            pluginLoadReport({ failures: [{ plugin: "A", reason: "r" }], ignored: [] }).notice,
        ).toBe("A BPMN plugin could not be loaded and is left out. See the log for details.");
    });
});

describe("pluginConstructionFailureReport", () => {
    it("tells the user the editor opened without its plugins", () => {
        expect(pluginConstructionFailureReport(new Error('No provider for "foo"!'))).toEqual({
            logLines: [
                'The BPMN plugins stopped the editor from opening, so it opened without them: No provider for "foo"!',
            ],
            notice: "The BPMN plugins stopped the editor from opening, so it opened without them. See the log for details.",
        });
    });
});
