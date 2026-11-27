import { describe, expect, it, vi } from "vitest";
import { type Engine, UnsupportedEngineError } from "@miragon/bpmn-modeler-types";

import type { CreateModelerOptions } from "../../modeler/port/publicApi";
import { modelerFeatures } from "./modelerFeatures";

const container = document.createElement("div");
const parent = document.createElement("div");

async function idsOf(options: Partial<CreateModelerOptions> & { engine: Engine }) {
    const features = await Promise.all(
        modelerFeatures(container, { propertiesPanel: { parent }, linting: false, ...options }),
    );
    return features.map(({ id }) => id);
}

const LEADING = ["minimap", "executableFix", "nativeCopyPaste", "copyAsImage"];
const MIDDLE = [
    "createAppendAnything",
    "elementTemplates",
    "alignToOrigin",
    "grid",
    "i18n",
    "tokenSimulation",
    "lint",
    "appendMenu",
    "popupMenuAnnotations",
    "flowNavigation",
    "layout",
    "elementIds",
    "propertiesPanel",
    "drilldownFit",
];

describe("modelerFeatures", () => {
    it("throws for an unknown engine before building any feature", () => {
        expect(() =>
            modelerFeatures(container, { engine: "c9" as Engine, propertiesPanel: { parent } }),
        ).toThrow(UnsupportedEngineError);
    });

    it("lists Camunda 7's features with the transaction boundaries after the drill-down fit", async () => {
        expect(await idsOf({ engine: "c7" })).toEqual([
            ...LEADING,
            "camunda7",
            ...MIDDLE,
            "transactionBoundaries",
            "caller",
        ]);
    });

    it("lists Camunda 8's features without the transaction boundaries", async () => {
        expect(await idsOf({ engine: "c8" })).toEqual([
            ...LEADING,
            "camunda8",
            ...MIDDLE,
            "caller",
        ]);
    });

    it("adds the capabilities, inline scripting only where the engine has it, then the clipboard", async () => {
        const capabilities = {
            modelNavigation: { openReference: vi.fn() },
            codeLink: { navigateToImplementation: vi.fn(), syncActivities: vi.fn() },
            definitionSearch: { search: vi.fn(async () => []) },
            scripting: { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() },
        };
        const clipboard = { bridge: { requestClipboard: vi.fn(), writeClipboard: vi.fn() } };
        const tail = ["modelNavigation", "codeLink", "definitionSearch"];

        expect((await idsOf({ engine: "c7", capabilities, clipboard })).slice(-6)).toEqual([
            ...tail,
            "inlineScripting",
            "clipboard",
            "caller",
        ]);
        expect((await idsOf({ engine: "c8", capabilities, clipboard })).slice(-5)).toEqual([
            ...tail,
            "clipboard",
            "caller",
        ]);
    });

    it("ends with the caller's modules and moddle extensions", async () => {
        const additionalModules = [{ probe: ["value", 1] }];
        const moddleExtensions = { acme: { prefix: "acme" } };
        const features = await Promise.all(
            modelerFeatures(container, {
                engine: "c8",
                propertiesPanel: { parent },
                linting: false,
                additionalModules,
                moddleExtensions,
            }),
        );

        expect(features.at(-1)).toEqual({
            id: "caller",
            modules: additionalModules,
            moddleExtensions,
        });
    });
});
