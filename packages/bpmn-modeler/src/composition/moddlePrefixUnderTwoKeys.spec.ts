import { describe, expect, it } from "vitest";

import type { BpmnFeature } from "../kernel/domain/bpmnFeature";
import { moddlePrefixUnderTwoKeys } from "./moddlePrefixUnderTwoKeys";

function feature(id: string, extra: Partial<BpmnFeature> = {}): BpmnFeature {
    return { id, modules: [{ [id]: ["value", id] }], ...extra };
}

describe("moddlePrefixUnderTwoKeys", () => {
    const camunda = { name: "Camunda", prefix: "camunda", uri: "a" };
    const camundaOverride = { name: "Camunda", prefix: "camunda", uri: "b" };
    const acme = { name: "Acme", prefix: "acme", uri: "c" };

    it("passes distinct prefixes and a key a later feature lists again", () => {
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { camunda: camundaOverride, acme } }),
            ]),
        ).toBeUndefined();
    });

    it("names a prefix that a second key carries, across features or within one", () => {
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { mine: camundaOverride } }),
            ]),
        ).toBe("camunda");
        expect(
            moddlePrefixUnderTwoKeys([
                feature("caller", {
                    moddleExtensions: { "acme-plugin": acme, "acme-copy": { ...acme } },
                }),
            ]),
        ).toBe("acme");
    });

    it("forgets a package whose key a later feature lists with another prefix", () => {
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { camunda: acme, acme } }),
            ]),
        ).toBe("acme");
        expect(
            moddlePrefixUnderTwoKeys([
                feature("engine", { moddleExtensions: { camunda } }),
                feature("caller", { moddleExtensions: { camunda: acme } }),
            ]),
        ).toBeUndefined();
    });
});
