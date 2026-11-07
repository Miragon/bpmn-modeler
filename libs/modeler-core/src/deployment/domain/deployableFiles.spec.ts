import { describe, expect, it } from "vitest";

import { globToRegExp } from "../../kernel/domain/globToRegExp";
import { DEPLOYABLE_FILES_GLOB, isDeployableFile } from "./deployableFiles";

describe("deployable files", () => {
    it.each([
        { path: "processes/order.bpmn", deployable: true },
        { path: "decisions/discount.dmn", deployable: true },
        { path: "order.bpmn", deployable: true },
        { path: "forms/order.form", deployable: false },
        { path: "payloads/vars.json", deployable: false },
        { path: "processes/order.bpmn.json", deployable: false },
        { path: "processes/order.bpmnx", deployable: false },
        { path: "processes/bpmn", deployable: false },
    ])("finds and accepts $path alike: $deployable", ({ path, deployable }) => {
        expect(globToRegExp(DEPLOYABLE_FILES_GLOB).test(path)).toBe(deployable);
        expect(isDeployableFile(path)).toBe(deployable);
    });

    it("accepts an upper-case extension", () => {
        expect(isDeployableFile("/ws/ORDER.BPMN")).toBe(true);
    });
});
