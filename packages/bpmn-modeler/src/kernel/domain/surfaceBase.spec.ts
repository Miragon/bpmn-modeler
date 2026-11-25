import { describe, expect, it } from "vitest";

import { baseOfLoaded, isBaseConstructor, surfaceBaseKind } from "./surfaceBase";

class Viewer {
    importXML(): string {
        return "imported";
    }
}
class Modeler extends Viewer {
    createDiagram(): string {
        return "created";
    }
}

describe("surface base", () => {
    it.each([
        { name: "a viewer constructor", value: Viewer, expected: true },
        { name: "a modeler constructor", value: Modeler, expected: true },
        { name: "an arrow loader", value: () => Promise.resolve(Viewer), expected: false },
        {
            name: "a function loader, which has a prototype too",
            value: function load() {
                return Promise.resolve(Viewer);
            },
            expected: false,
        },
        { name: "a non-function", value: {}, expected: false },
    ])("tells $name apart", ({ value, expected }) => {
        expect(isBaseConstructor(value)).toBe(expected);
    });

    it("takes a loaded module's default export or the loaded constructor itself", () => {
        expect(baseOfLoaded({ default: Viewer })).toBe(Viewer);
        expect(baseOfLoaded(Modeler)).toBe(Modeler);
        expect(baseOfLoaded(null)).toBeUndefined();
    });

    it("reads a modeler base from createDiagram", () => {
        expect(surfaceBaseKind(Modeler)).toBe("modeler");
        expect(surfaceBaseKind(Viewer)).toBe("viewer");
    });
});
