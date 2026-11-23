import { describe, expect, it } from "vitest";

import { moddleDescriptor, resolveBpmnModdleFactory } from "./bpmnModdleFactory";

describe("resolveBpmnModdleFactory", () => {
    const factory = () => ({}) as never;

    it("takes the default export when the module has one", () => {
        expect(resolveBpmnModdleFactory({ default: factory, BpmnModdle: () => ({}) })).toBe(
            factory,
        );
    });

    it("falls back to the named BpmnModdle export", () => {
        expect(resolveBpmnModdleFactory({ BpmnModdle: factory })).toBe(factory);
    });

    it("throws when the module exposes neither", () => {
        expect(() => resolveBpmnModdleFactory({})).toThrow(
            "bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.",
        );
    });
});

describe("moddleDescriptor", () => {
    const descriptor = { prefix: "camunda", uri: "http://camunda.org/schema/1.0/bpmn" };

    it("takes the default export when the module has one", () => {
        expect(moddleDescriptor({ default: descriptor })).toBe(descriptor);
    });

    it("takes the module itself when it has no default export", () => {
        expect(moddleDescriptor(descriptor)).toBe(descriptor);
    });
});
