import { describe, expect, it } from "vitest";

import { BpmnFileEntry, MigrationPlan } from "./MigrationPlan";

describe("MigrationPlan", () => {
    const c7Entry: BpmnFileEntry = {
        path: "/workspace/c7.bpmn",
        content: "<xml>c7</xml>",
        platform: "c7",
        version: "7.20.0",
    };

    const c8Entry: BpmnFileEntry = {
        path: "/workspace/c8.bpmn",
        content: "<xml>c8</xml>",
        platform: "c8",
        version: "8.5.0",
    };

    const c8NoVersion: BpmnFileEntry = {
        path: "/workspace/c8-noversion.bpmn",
        content: "<xml>c8</xml>",
        platform: "c8",
        version: undefined,
    };

    describe("isEmpty", () => {
        it("should return true when no classifiable files exist", () => {
            const plan = new MigrationPlan([], [], ["/unknown.bpmn"]);
            expect(plan.isEmpty()).toBe(true);
        });

        it("should return false when C7 files exist", () => {
            const plan = new MigrationPlan([c7Entry], [], []);
            expect(plan.isEmpty()).toBe(false);
        });

        it("should return false when C8 files exist", () => {
            const plan = new MigrationPlan([], [c8Entry], []);
            expect(plan.isEmpty()).toBe(false);
        });
    });

    describe("hasC7 / hasC8", () => {
        it("should detect C7 only", () => {
            const plan = new MigrationPlan([c7Entry], [], []);
            expect(plan.hasC7()).toBe(true);
            expect(plan.hasC8()).toBe(false);
        });

        it("should detect C8 only", () => {
            const plan = new MigrationPlan([], [c8Entry], []);
            expect(plan.hasC7()).toBe(false);
            expect(plan.hasC8()).toBe(true);
        });
    });

    describe("hasBothPlatforms", () => {
        it("should return true when both platforms are present", () => {
            const plan = new MigrationPlan([c7Entry], [c8Entry], []);
            expect(plan.hasBothPlatforms()).toBe(true);
        });

        it("should return false when only one platform is present", () => {
            const plan = new MigrationPlan([c7Entry], [], []);
            expect(plan.hasBothPlatforms()).toBe(false);
        });
    });

    describe("fileCount", () => {
        it("should count C7 files for scope 'c7'", () => {
            const plan = new MigrationPlan([c7Entry], [c8Entry, c8NoVersion], []);
            expect(plan.fileCount("c7")).toBe(1);
        });

        it("should count C8 files for scope 'c8'", () => {
            const plan = new MigrationPlan([c7Entry], [c8Entry, c8NoVersion], []);
            expect(plan.fileCount("c8")).toBe(2);
        });

        it("should count all files for scope 'both'", () => {
            const plan = new MigrationPlan([c7Entry], [c8Entry, c8NoVersion], []);
            expect(plan.fileCount("both")).toBe(3);
        });
    });
});
