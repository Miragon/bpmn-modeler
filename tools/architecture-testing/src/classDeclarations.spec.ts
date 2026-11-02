import { describe, expect, it } from "vitest";

import { readClassDeclarations } from "./classDeclarations";

describe("readClassDeclarations", () => {
    it.each([
        {
            form: "a class implementing one interface",
            source: "export class VsCodeSettings implements SettingsPort {}",
            classes: [{ name: "VsCodeSettings", implementedInterfaces: ["SettingsPort"] }],
        },
        {
            form: "a class implementing several interfaces",
            source: "class A implements Disposable, FooPort {}",
            classes: [{ name: "A", implementedInterfaces: ["Disposable", "FooPort"] }],
        },
        {
            form: "an implements clause split over lines",
            source: "class A\n    extends Base\n    implements\n        FooPort<string> {}",
            classes: [{ name: "A", implementedInterfaces: ["FooPort"] }],
        },
        {
            form: "a qualified interface name",
            source: "class A implements core.FooPort {}",
            classes: [{ name: "A", implementedInterfaces: ["core.FooPort"] }],
        },
        {
            form: "a class without heritage",
            source: "class A {}",
            classes: [{ name: "A", implementedInterfaces: [] }],
        },
        {
            form: "a class without an implements clause",
            source: "class A extends FooPort {}",
            classes: [{ name: "A", implementedInterfaces: [] }],
        },
        {
            form: "an anonymous class expression",
            source: "const a = new (class implements FooPort {})();",
            classes: [{ name: undefined, implementedInterfaces: ["FooPort"] }],
        },
    ])("reads $form", ({ source, classes }) => {
        expect(readClassDeclarations("module.ts", source)).toEqual(classes);
    });

    it("ignores a class named in a comment or a string", () => {
        const source =
            '// class A implements FooPort {}\nconst text = "class B implements BarPort {}";';

        expect(readClassDeclarations("module.ts", source)).toEqual([]);
    });
});
