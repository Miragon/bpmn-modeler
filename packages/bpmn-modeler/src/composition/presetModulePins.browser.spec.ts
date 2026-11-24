import { afterEach, describe, expect, it, vi } from "vitest";
import type { CodeLinkPort } from "@miragon/bpmn-modeler-code-link";
import type { DefinitionSearchPort } from "@miragon/bpmn-modeler-definition-search";
import type { InlineScriptingPort } from "@miragon/bpmn-modeler-inline-scripting";
import type { ModelNavigationPort } from "@miragon/bpmn-model-navigation";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
import type { Engine } from "@miragon/bpmn-modeler-types";

import * as lintModule from "../lint";
import { BASE_POPUP_MENU_ANNOTATIONS } from "../popupMenuAnnotations/domain/baseAnnotations";
import type { PopupMenuAnnotationOverrides } from "../popupMenuAnnotations/domain/popupMenuAnnotations";
import { C7_POPUP_MENU_ANNOTATIONS, C8_POPUP_MENU_ANNOTATIONS } from "./engineStacks";
import { createDesigner } from "./createDesigner";
import { createModeler } from "./createModeler";
import { createViewer } from "./createViewer";
import { createTemplatePreview } from "../templatePreview/service/createTemplatePreview";
import { BpmnModeler } from "../modeler/service/modeler";
import type { CreateModelerOptions } from "../modeler/port/publicApi";
import type { DesignerOptions } from "../design/port/publicApi";
import type { ViewerOptions } from "../viewer/port/publicApi";
import {
    afterPaint,
    mountWithPanel,
    removeMounts,
    type SurfaceMount,
} from "../__fixtures__/surfaceMount";
import {
    assembleModules,
    disagreementsWithInjector,
    injectorModulesOf,
    optionDelta,
    overridesOf,
    renderPins,
    winningValueOf,
    type DidiInjector,
    type DiModule,
    type ModuleAssembly,
    type Override,
} from "../__fixtures__/diModuleAssembly";

/**
 * Pins what each preset hands bpmn-js, read from the built instance: bpmn-js
 * passes its options to diagram-js as `config`, whose `modules` hold the static,
 * base and additional modules. A reorder or a provider that newly wins a DI name
 * shows as a changed line in the pins; an added module as added lines.
 */

interface BuiltSurface {
    getService<T = unknown>(name: string): T;
    destroy(): void;
}

type Build<O> = (mount: SurfaceMount, options: Partial<O>) => Promise<BuiltSurface>;
type OptionVariant<O> = readonly [label: string, options: Partial<O>];

const ENGINES: readonly Engine[] = ["c7", "c8"];
const PINS = "./__snapshots__/presetModulePins";

const modelNavigation: ModelNavigationPort = { openReference: vi.fn() };
const codeLink: CodeLinkPort = { navigateToImplementation: vi.fn(), syncActivities: vi.fn() };
const definitionSearch: DefinitionSearchPort = { search: vi.fn(async () => []) };
const scripting: InlineScriptingPort = { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() };
const bridge: ClipboardBridge = {
    requestClipboard: vi.fn(async () => ""),
    writeClipboard: vi.fn(),
};
const CALLER_MODULE = { callerProbe: ["value", "caller"] };

const LINT_VARIANTS = [
    ["linting: false", { linting: false }],
    ["linting: { module } (in-page tier)", { linting: { module: lintModule } }],
    [
        'linting: { module, results: "external" }',
        { linting: { module: lintModule, results: "external" } },
    ],
] as const;

const MODELER_VARIANTS: readonly OptionVariant<CreateModelerOptions>[] = [
    ...LINT_VARIANTS,
    ['mode: "design"', { mode: "design" }],
    ["capabilities.modelNavigation", { capabilities: { modelNavigation } }],
    ["capabilities.codeLink", { capabilities: { codeLink } }],
    ["capabilities.definitionSearch", { capabilities: { definitionSearch } }],
    ["capabilities.scripting", { capabilities: { scripting } }],
    ["clipboard: { bridge }", { clipboard: { bridge } }],
    ["additionalModules", { additionalModules: [CALLER_MODULE] }],
    [
        "in-page linting, every capability, clipboard and additionalModules at once",
        {
            linting: { module: lintModule },
            capabilities: { modelNavigation, codeLink, definitionSearch, scripting },
            clipboard: { bridge },
            additionalModules: [CALLER_MODULE],
        },
    ],
];

const DESIGNER_VARIANTS: readonly OptionVariant<DesignerOptions>[] = [
    ...LINT_VARIANTS,
    ["capabilities.modelNavigation", { capabilities: { modelNavigation } }],
    ["capabilities.definitionSearch", { capabilities: { definitionSearch } }],
    ["clipboard: { bridge }", { clipboard: { bridge } }],
    ["additionalModules", { additionalModules: [CALLER_MODULE] }],
    [
        "in-page linting, every capability, clipboard and additionalModules at once",
        {
            linting: { module: lintModule },
            capabilities: { modelNavigation, definitionSearch },
            clipboard: { bridge },
            additionalModules: [CALLER_MODULE],
        },
    ],
];

const VIEWER_VARIANTS: readonly OptionVariant<ViewerOptions & { withPanel: true }>[] = [
    ["propertiesPanel", { withPanel: true }],
    ["capabilities.modelNavigation", { capabilities: { modelNavigation } }],
    ["additionalModules", { additionalModules: [CALLER_MODULE] }],
    [
        "propertiesPanel, capabilities.modelNavigation and additionalModules at once",
        {
            withPanel: true,
            capabilities: { modelNavigation },
            additionalModules: [CALLER_MODULE],
        },
    ],
];

const ENGINE_POPUP_MENU_ANNOTATIONS: Record<Engine, PopupMenuAnnotationOverrides> = {
    c7: C7_POPUP_MENU_ANNOTATIONS,
    c8: C8_POPUP_MENU_ANNOTATIONS,
};

const PREVIEW_TEMPLATES: Record<Engine, object> = {
    c7: {
        $schema: "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json",
        name: "Pinned task",
        id: "com.example.pinned",
        appliesTo: ["bpmn:ServiceTask"],
        properties: [],
    },
    c8: {
        $schema:
            "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
        name: "Pinned task",
        id: "com.example.pinned",
        appliesTo: ["bpmn:ServiceTask"],
        properties: [],
    },
};

function modelerBuild(engine: Engine): Build<CreateModelerOptions> {
    return ({ container, panel }, options) =>
        createModeler(container, { engine, propertiesPanel: { parent: panel }, ...options });
}

const designerBuild: Build<DesignerOptions> = ({ container, panel }, options) =>
    createDesigner(container, { propertiesPanel: { parent: panel }, ...options });

const viewerBuild: Build<ViewerOptions & { withPanel: true }> = (
    { container, panel },
    { withPanel, ...options },
) =>
    createViewer(container, {
        ...options,
        ...(withPanel && { propertiesPanel: { parent: panel } }),
    });

function assemblyOfSurface(surface: BuiltSurface): ModuleAssembly {
    const config = surface.getService<{ modules: DiModule[] }>("config");
    const assembly = assembleModules(injectorModulesOf(config));
    expect(
        disagreementsWithInjector(assembly, surface.getService<DidiInjector>("injector")),
    ).toEqual([]);
    return assembly;
}

async function assemblyOf<O>(build: Build<O>, options: Partial<O> = {}): Promise<ModuleAssembly> {
    const surface = await build(mountWithPanel(), options);
    try {
        return assemblyOfSurface(surface);
    } finally {
        await afterPaint();
        surface.destroy();
    }
}

async function optionDeltas<O>(
    title: string,
    build: Build<O>,
    variants: readonly OptionVariant<O>[],
): Promise<string> {
    const base = await assemblyOf(build);
    const lines = [`# ${title}: what each option adds, removes or replaces against the defaults`];
    for (const [label, options] of variants) {
        const delta = optionDelta(base, await assemblyOf(build, options));
        lines.push("", `## ${label}`, ...(delta.length > 0 ? delta : ["(no change)"]));
    }
    return `${lines.join("\n")}\n`;
}

async function expectPins(file: string, title: string, assembly: ModuleAssembly): Promise<void> {
    await expect(renderPins(title, assembly)).toMatchFileSnapshot(`${PINS}/${file}.txt`);
}

// The pins print a class instance by its type, so this engine-specific value is checked by content.
function expectPopupMenuAnnotationsOf(assembly: ModuleAssembly, engine?: Engine): void {
    expect
        .soft(winningValueOf(assembly, "popupMenuAnnotations"))
        .toEqual(
            BASE_POPUP_MENU_ANNOTATIONS.withOverrides(
                engine ? ENGINE_POPUP_MENU_ANNOTATIONS[engine] : {},
            ),
        );
}

const TOKEN_SIMULATION_ANIMATION: Record<string, Override> = {
    sequenceFlowBehavior: {
        winner: "type(AnimatedSequenceFlowBehavior) @sequenceFlowBehavior",
        over: ["type(SequenceFlowBehavior) @startEventBehavior"],
    },
};

// Token simulation's simulator behaviours take three DI names of bpmn-js's modeling
// behaviours, whose `__init__` then builds the simulator's; pinned as it is, not as intended.
const EDITING_OVERRIDES: Record<string, Override> = {
    ...TOKEN_SIMULATION_ANIMATION,
    boundaryEventBehavior: {
        winner: "type(BoundaryEventBehavior) @startEventBehavior",
        over: ["type(BoundaryEventBehavior) @adaptiveLabelPositioningBehavior"],
    },
    eventBasedGatewayBehavior: {
        winner: "type(EventBasedGatewayBehavior) @startEventBehavior",
        over: ["type(EventBasedGatewayBehavior) @adaptiveLabelPositioningBehavior"],
    },
    messageFlowBehavior: {
        winner: "type(AnimatedMessageFlowBehavior) @sequenceFlowBehavior",
        over: [
            "type(MessageFlowBehavior) @startEventBehavior",
            "type(MessageFlowBehavior) @adaptiveLabelPositioningBehavior",
        ],
    },
    createMoveSnapping: {
        winner: "type(BpmnCreateMoveSnapping) @connectSnapping",
        over: ["type(CreateMoveSnapping) @createMoveSnapping"],
    },
    editorActions: {
        winner: "type(BpmnEditorActions) @editorActions",
        over: ["type(EditorActions) @editorActions"],
    },
    elementFactory: {
        winner: "type(ElementFactory) @bpmnFactory",
        over: ["type(ElementFactory) @canvas"],
    },
    keyboardBindings: {
        winner: "type(BpmnKeyboardBindings) @keyboardBindings",
        over: ["type(KeyboardBindings) @keyboard"],
    },
    spaceTool: {
        winner: "type(BpmnSpaceTool) @spaceTool",
        over: ["type(SpaceTool) @spaceTool"],
    },
    translate: {
        winner: "factory(translateFactory) @customTranslator",
        over: ["value(fn translate) @translate"],
    },
};

const MODELER_OVERRIDES: Record<string, Override> = {
    ...EDITING_OVERRIDES,
    debounceInput: {
        winner: "factory(debounceInputFactory) @debounceInput",
        over: ["factory(debounceInput) @debounceInput"],
    },
};

const VIEWER_OVERRIDES: Record<string, Override> = {
    ...TOKEN_SIMULATION_ANIMATION,
    messageFlowBehavior: {
        winner: "type(AnimatedMessageFlowBehavior) @sequenceFlowBehavior",
        over: ["type(MessageFlowBehavior) @startEventBehavior"],
    },
};

describe("preset module pins", () => {
    afterEach(removeMounts);

    describe.each(ENGINES)("createModeler (%s)", (engine) => {
        it("pins the module order, winning providers and __init__ order of the defaults", async () => {
            const assembly = await assemblyOf(modelerBuild(engine));

            expect.soft(overridesOf(assembly)).toEqual(MODELER_OVERRIDES);
            expectPopupMenuAnnotationsOf(assembly, engine);
            await expectPins(
                `modeler-${engine}`,
                `createModeler (${engine}), default options`,
                assembly,
            );
        });

        it("pins what each option adds, removes or replaces", async () => {
            await expect(
                await optionDeltas(
                    `createModeler (${engine})`,
                    modelerBuild(engine),
                    MODELER_VARIANTS,
                ),
            ).toMatchFileSnapshot(`${PINS}/modeler-${engine}.options.txt`);
        });
    });

    describe("createDesigner", () => {
        it("pins the module order, winning providers and __init__ order of the defaults", async () => {
            const assembly = await assemblyOf(designerBuild);

            expect.soft(overridesOf(assembly)).toEqual(EDITING_OVERRIDES);
            expectPopupMenuAnnotationsOf(assembly);
            await expectPins("designer", "createDesigner, default options", assembly);
        });

        it("pins what each option adds, removes or replaces", async () => {
            await expect(
                await optionDeltas("createDesigner", designerBuild, DESIGNER_VARIANTS),
            ).toMatchFileSnapshot(`${PINS}/designer.options.txt`);
        });
    });

    describe("createViewer", () => {
        it("pins the module order, winning providers and __init__ order of the defaults", async () => {
            const assembly = await assemblyOf(viewerBuild);

            expect.soft(overridesOf(assembly)).toEqual(VIEWER_OVERRIDES);
            await expectPins("viewer", "createViewer, default options", assembly);
        });

        it("pins what each option adds, removes or replaces", async () => {
            await expect(
                await optionDeltas("createViewer", viewerBuild, VIEWER_VARIANTS),
            ).toMatchFileSnapshot(`${PINS}/viewer.options.txt`);
        });
    });

    describe.each(ENGINES)("createTemplatePreview (%s)", (engine) => {
        it("pins the module order, winning providers and __init__ order of its modeler", async () => {
            const init = vi.spyOn(BpmnModeler.prototype, "init");
            const preview = await createTemplatePreview(mountWithPanel().panel);
            try {
                await preview.show(PREVIEW_TEMPLATES[engine], engine);
                const [modeler] = init.mock.contexts as BpmnModeler[];
                const assembly = assemblyOfSurface(modeler);

                expect.soft(overridesOf(assembly)).toEqual(MODELER_OVERRIDES);
                expectPopupMenuAnnotationsOf(assembly, engine);
                await expectPins(
                    `template-preview-${engine}`,
                    `createTemplatePreview (${engine})`,
                    assembly,
                );
            } finally {
                await afterPaint();
                preview.destroy();
                init.mockRestore();
            }
        });
    });
});
