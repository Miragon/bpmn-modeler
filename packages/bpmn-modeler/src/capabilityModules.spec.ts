import { describe, expect, it } from "vitest";

import { capabilityModules } from "./capabilityModules";

/** A didi bundle: string keys → either `["type", Ctor]` or `["value", obj]`. */
type Bundle = Record<string, unknown>;

/** Names of the `["value", …]` entries in a bundle — i.e. its DI value tokens. */
function valueTokens(bundle: Bundle): string[] {
    return Object.entries(bundle)
        .filter(([, spec]) => Array.isArray(spec) && spec[0] === "value")
        .map(([token]) => token);
}

/** The bundle in `modules` that registers `token` as a value, if any. */
function bundleWithValue(modules: Bundle[], token: string): Bundle | undefined {
    return modules.find((bundle) => valueTokens(bundle).includes(token));
}

const navPort = { openReference: () => {} };
const codeLinkPort = { navigateToImplementation: () => {}, syncActivities: () => {} };
const scriptingPort = { openScriptEditor: () => {}, scriptSourceChanged: () => {} };

describe("capabilityModules", () => {
    it("registers nothing when no capabilities are given", () => {
        expect(capabilityModules("c7")).toEqual([]);
        expect(capabilityModules("c7", {})).toEqual([]);
        expect(capabilityModules("c8", {})).toEqual([]);
    });

    it("registers only model navigation, carrying the port under modelNavigationPort", () => {
        const modules = capabilityModules("c7", { modelNavigation: navPort }) as Bundle[];

        expect(modules).toHaveLength(1);
        // The provider injects "modelNavigationPort" (verified in the lib's own
        // spec); the factory must embed the port under that exact token or DI
        // would fail at runtime, so pin the stringly-typed name here.
        expect(modules[0].modelNavigationPort).toEqual(["value", navPort]);
        expect(modules[0].__init__).toEqual([
            "formReferenceStatusClient",
            "navigateContextPadProvider",
        ]);
        expect(modules[0].formReferenceStatusClient).toBeDefined();
        expect(modules[0].navigateContextPadProvider).toBeDefined();
    });

    it("registers only code link, carrying the port under codeLinkPort", () => {
        const modules = capabilityModules("c8", { codeLink: codeLinkPort }) as Bundle[];

        expect(modules).toHaveLength(1);
        expect(modules[0].codeLinkPort).toEqual(["value", codeLinkPort]);
        // Client-first init order (the client subscribes before the provider reads it).
        expect(modules[0].__init__).toEqual(["codeLinkMapClient", "codeLinkContextPadProvider"]);
    });

    it("registers scripting on c7, carrying the port under inlineScriptingPort", () => {
        const modules = capabilityModules("c7", { scripting: scriptingPort }) as Bundle[];

        const portBundle = bundleWithValue(modules, "inlineScriptingPort");
        expect(portBundle).toBeDefined();
        expect(portBundle!.inlineScriptingPort).toEqual(["value", scriptingPort]);
        expect(portBundle!.inlineScriptingPortForwarder).toBeDefined();
    });

    it("does NOT register scripting on c8 even when the port is present", () => {
        const modules = capabilityModules("c8", { scripting: scriptingPort }) as Bundle[];

        expect(bundleWithValue(modules, "inlineScriptingPort")).toBeUndefined();
        expect(modules).toEqual([]);
    });

    it("registers every present capability together", () => {
        const modules = capabilityModules("c7", {
            modelNavigation: navPort,
            codeLink: codeLinkPort,
            scripting: scriptingPort,
        }) as Bundle[];

        expect(bundleWithValue(modules, "modelNavigationPort")).toBeDefined();
        expect(bundleWithValue(modules, "codeLinkPort")).toBeDefined();
        expect(bundleWithValue(modules, "inlineScriptingPort")).toBeDefined();
    });
});
