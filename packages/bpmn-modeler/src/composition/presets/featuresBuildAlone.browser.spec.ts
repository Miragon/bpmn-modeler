// Each modeler feature builds on the kernel with only stubs for the names it declares in
// `requires`: a name it injects from another feature without declaring it fails here.
import Modeler from "bpmn-js/lib/Modeler";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    NeutralPropertiesProviderModule,
    PropertiesPanelModule,
} from "@miragon/bpmn-modeler-properties-panel";
import { ENGINES } from "@miragon/bpmn-modeler-types";

import { alignToOrigin } from "../../alignToOrigin/adapter/in/alignToOriginFeature";
import { appendMenu, createAppendAnything } from "../../appendMenu/adapter/in/appendMenuFeatures";
import { clipboard, nativeCopyPaste } from "../../clipboard/adapter/in/clipboardFeature";
import { codeLink } from "../../codeLink/adapter/in/codeLinkFeature";
import { copyAsImage } from "../../copyAsImage/adapter/in/copyAsImageFeature";
import { definitionSearch } from "../../definitionSearch/adapter/in/definitionSearchFeature";
import { elementIds } from "../../elementIds/adapter/in/elementIdsFeature";
import { elementTemplates } from "../../elementTemplates/adapter/in/elementTemplatesFeature";
import { camunda7, camunda8 } from "../../engines/adapter/in/engineFeatures";
import { executableFix } from "../../executableFix/adapter/in/executableFixFeature";
import { flowNavigation } from "../../flowNavigation/adapter/in/flowNavigationFeature";
import { grid } from "../../grid/adapter/in/gridFeature";
import { i18n } from "../../i18n/adapter/in/i18nFeature";
import { inlineScripting } from "../../inlineScripting/adapter/in/inlineScriptingFeature";
import type { BpmnFeature } from "../../kernel/domain/bpmnFeature";
import { layout } from "../../layout/adapter/in/layoutFeature";
import { minimap } from "../../minimap/adapter/in/minimapFeature";
import { modelNavigation } from "../../modelNavigation/adapter/in/modelNavigationFeature";
import { popupMenuAnnotations } from "../../popupMenuAnnotations/adapter/in/popupMenuAnnotationsModule";
import { propertiesPanel } from "../../propertiesPanel/adapter/in/propertiesPanelFeature";
import { tokenSimulation } from "../../tokenSimulation/adapter/in/tokenSimulationFeature";
import { transactionBoundaries } from "../../transactionBoundaries/adapter/in/transactionBoundariesFeature";
import { afterPaint, mountWithPanel, removeMounts } from "../../__fixtures__/surfaceMount";
import { createSurface } from "../createSurface";

// Answers every member with a no-op, so a stub stands in for any service's calls at construction.
function stubService(): unknown {
    const noOp = (): undefined => undefined;
    return new Proxy(noOp, {
        get: (_target, key) => (key === "then" ? undefined : noOp),
    });
}

function stubsFor({ id, requires = [] }: BpmnFeature): BpmnFeature {
    return {
        id: `stubs for ${id}`,
        modules: requires.map((name) => ({ [name]: ["value", stubService()] })),
    };
}

const bridge = { requestClipboard: vi.fn(async () => ""), writeClipboard: vi.fn() };

const FEATURES: readonly (readonly [string, () => BpmnFeature | Promise<BpmnFeature>])[] = [
    ["minimap", minimap],
    ["executableFix", executableFix],
    ["nativeCopyPaste", nativeCopyPaste],
    ["copyAsImage", copyAsImage],
    ["camunda7", camunda7],
    ["camunda8", camunda8],
    ...ENGINES.map(
        (engine) => [`elementTemplates(${engine})`, () => elementTemplates(engine)] as const,
    ),
    ["createAppendAnything", createAppendAnything],
    ["alignToOrigin", alignToOrigin],
    ["grid", grid],
    ["i18n", i18n],
    ["tokenSimulation", tokenSimulation],
    ["appendMenu", appendMenu],
    ["popupMenuAnnotations", popupMenuAnnotations],
    ["flowNavigation", flowNavigation],
    ["layout", layout],
    ["elementIds", elementIds],
    ["propertiesPanel", () => propertiesPanel({ parent: document.createElement("div") })],
    ["transactionBoundaries", transactionBoundaries],
    ["modelNavigation", () => modelNavigation({ openReference: vi.fn() })],
    ["codeLink", () => codeLink({ navigateToImplementation: vi.fn(), syncActivities: vi.fn() })],
    ["definitionSearch", () => definitionSearch({ search: vi.fn(async () => []) })],
    [
        "inlineScripting",
        () => inlineScripting({ openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() }),
    ],
    ["clipboard", () => clipboard({ bridge })],
];

describe("each modeler feature builds alone", () => {
    afterEach(removeMounts);

    it.each(FEATURES)("%s", async (_label, build) => {
        const feature = await build();
        const { container, panel } = mountWithPanel();

        const surface = await createSurface(container, {
            base: Modeler,
            features: [stubsFor(feature), feature],
            extraRoots: [panel],
        });

        expect(surface.base).toBe("modeler");
        await afterPaint();
        surface.destroy();
    });

    it("fails element templates on the forked panel, which no engine renders in", async () => {
        const { container, panel } = mountWithPanel();
        const forkedPanel: BpmnFeature = {
            id: "forkedPanel",
            modules: [PropertiesPanelModule, NeutralPropertiesProviderModule],
        };

        await expect(
            createSurface(container, {
                base: Modeler,
                features: [forkedPanel, await elementTemplates("c7")],
                extraRoots: [panel],
            }),
        ).rejects.toThrow('feature "elementTemplates" requires "bpmnPropertiesProvider"');
    });
});
