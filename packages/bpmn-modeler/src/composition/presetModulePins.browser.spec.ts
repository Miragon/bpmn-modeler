// Pins what each preset hands bpmn-js, read from the built instance: bpmn-js passes its
// options to diagram-js as `config`, whose `modules` hold the static, base and additional
// modules, and builds its moddle from the moddle extensions. A reorder, a provider that newly
// wins a DI name or a changed config leaf shows as a changed line in the pins; an added module
// or key as added lines.
// A bump of bpmn-js, diagram-js, token simulation or the properties panel updates the pins with
// `-u` in the bump PR; `yarn.lock` selects this package's test target.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENGINES, type Engine } from "@miragon/bpmn-modeler-types";
import { SURFACE_MODE_SERVICE, type SurfaceModeService } from "@miragon/bpmn-modeler-types/domain";

import { BASE_POPUP_MENU_ANNOTATIONS } from "../popupMenuAnnotations/domain/baseAnnotations";
import type { PopupMenuAnnotationOverrides } from "../kernel/domain/popupMenus";
import {
    C7_POPUP_MENU_ANNOTATIONS,
    C8_POPUP_MENU_ANNOTATIONS,
} from "../engines/domain/popupMenuAnnotationOverrides";
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
    disagreementsWithInjector,
    overridesOf,
    winningValueOf,
    type DidiInjector,
    type DiModule,
    type ModuleAssembly,
    type Override,
} from "../__fixtures__/diModuleAssembly";
import {
    ACME_MODDLE,
    bridge,
    CALLER_MODULE,
    definitionSearch,
    LINT_VARIANTS,
    lintModule,
    modelerVariants,
    modelNavigation,
    onLintingToggled,
    onLintResults,
    PREVIEW_TEMPLATES,
    textBridge,
    VALUE_ROLES,
    type OptionVariant,
} from "../__fixtures__/presetPinOptions";
import {
    optionDelta,
    renderPins,
    surfacePinsOf,
    type ModdlePackage,
    type SurfacePins,
} from "../__fixtures__/presetPinText";

interface BuiltSurface {
    getService<T = unknown>(name: string): T;
    destroy(): void;
}

interface OptionalLookup {
    get<T>(name: string, strict: false): T | null;
}

type Build<O> = (mount: SurfaceMount, options: Partial<O>) => Promise<BuiltSurface>;

const PINS = "./__snapshots__/presetModulePins";
const PIN_FILES = [
    ...ENGINES.flatMap((engine) => [
        `modeler-${engine}.txt`,
        `modeler-${engine}.options.txt`,
        `template-preview-${engine}.delta.txt`,
    ]),
    "designer.txt",
    "designer.options.txt",
    "viewer.txt",
    "viewer.options.txt",
];

const DESIGNER_VARIANTS: readonly OptionVariant<DesignerOptions>[] = [
    ...LINT_VARIANTS,
    [
        "linting: { module }, onLintResults and onLintingToggled",
        { linting: { module: lintModule }, onLintResults, onLintingToggled },
    ],
    ["capabilities.modelNavigation", { capabilities: { modelNavigation } }],
    ["capabilities.definitionSearch", { capabilities: { definitionSearch } }],
    ["clipboard: { bridge }", { clipboard: { bridge } }],
    ["clipboard: { bridge, text }", { clipboard: { bridge, text: textBridge } }],
    ["moddleExtensions", { moddleExtensions: { acme: ACME_MODDLE } }],
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
    ["moddleExtensions", { moddleExtensions: { acme: ACME_MODDLE } }],
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

function pinsOfSurface(surface: BuiltSurface): SurfacePins {
    const moddle = surface.getService<{ getPackages(): ModdlePackage[] }>("moddle");
    const injector = surface.getService<DidiInjector & OptionalLookup>("injector");
    const pins = surfacePinsOf(
        surface.getService<{ modules: DiModule[] }>("config"),
        moddle.getPackages(),
        VALUE_ROLES,
        injector.get<SurfaceModeService>(SURFACE_MODE_SERVICE, false)?.get(),
    );
    expect(disagreementsWithInjector(pins.assembly, injector)).toEqual([]);
    return pins;
}

async function pinsOf<O>(build: Build<O>, options: Partial<O> = {}): Promise<SurfacePins> {
    const surface = await build(mountWithPanel(), options);
    try {
        return pinsOfSurface(surface);
    } finally {
        await afterPaint();
        surface.destroy();
    }
}

function deltaLines(delta: readonly string[]): readonly string[] {
    return delta.length > 0 ? delta : ["(no change)"];
}

async function optionDeltas<O>(
    title: string,
    build: Build<O>,
    variants: readonly OptionVariant<O>[],
): Promise<string> {
    const base = await pinsOf(build);
    const lines = [`# ${title}: what each option adds, removes or replaces against the defaults`];
    for (const [label, options] of variants) {
        const variant = await pinsOf(build, options);
        // An overwrite an option brings shows in its delta only as a `~` line, which `-u` accepts.
        expect.soft(overridesOf(variant.assembly), label).toEqual(overridesOf(base.assembly));
        lines.push("", `## ${label}`, ...deltaLines(optionDelta(base, variant)));
    }
    return `${lines.join("\n")}\n`;
}

async function expectPins(file: string, title: string, pins: SurfacePins): Promise<void> {
    await expect(renderPins(title, pins)).toMatchFileSnapshot(`${PINS}/${file}.txt`);
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

// Token simulation's simulator behaviours take three DI names of bpmn-js's modeling behaviours;
// the module labelled @simulatorBoundaryEventBehavior registers bpmn-js's classes over them
// again. Both sides' classes share a name, so these lines show where the winner was registered,
// not which class it is: the behaviour specs beside this one tell the classes apart.
const EDITING_OVERRIDES: Record<string, Override> = {
    ...TOKEN_SIMULATION_ANIMATION,
    boundaryEventBehavior: {
        winner: "type(BoundaryEventBehavior) @simulatorBoundaryEventBehavior",
        over: [
            "type(BoundaryEventBehavior) @startEventBehavior",
            "type(BoundaryEventBehavior) @adaptiveLabelPositioningBehavior",
        ],
    },
    eventBasedGatewayBehavior: {
        winner: "type(EventBasedGatewayBehavior) @simulatorBoundaryEventBehavior",
        over: [
            "type(EventBasedGatewayBehavior) @startEventBehavior",
            "type(EventBasedGatewayBehavior) @adaptiveLabelPositioningBehavior",
        ],
    },
    messageFlowBehavior: {
        winner: "type(MessageFlowBehavior) @simulatorBoundaryEventBehavior",
        over: [
            "type(AnimatedMessageFlowBehavior) @sequenceFlowBehavior",
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
        it("pins the module order, winning providers, __init__ order, config and moddle of the defaults", async () => {
            const pins = await pinsOf(modelerBuild(engine));

            expect.soft(overridesOf(pins.assembly)).toEqual(MODELER_OVERRIDES);
            expectPopupMenuAnnotationsOf(pins.assembly, engine);
            await expectPins(
                `modeler-${engine}`,
                `createModeler (${engine}), default options`,
                pins,
            );
        });

        it("pins what each option adds, removes or replaces", async () => {
            await expect(
                await optionDeltas(
                    `createModeler (${engine})`,
                    modelerBuild(engine),
                    modelerVariants(engine),
                ),
            ).toMatchFileSnapshot(`${PINS}/modeler-${engine}.options.txt`);
        });
    });

    describe("createDesigner", () => {
        it("pins the module order, winning providers, __init__ order, config and moddle of the defaults", async () => {
            const pins = await pinsOf(designerBuild);

            expect.soft(overridesOf(pins.assembly)).toEqual(EDITING_OVERRIDES);
            expectPopupMenuAnnotationsOf(pins.assembly);
            await expectPins("designer", "createDesigner, default options", pins);
        });

        it("pins what each option adds, removes or replaces", async () => {
            await expect(
                await optionDeltas("createDesigner", designerBuild, DESIGNER_VARIANTS),
            ).toMatchFileSnapshot(`${PINS}/designer.options.txt`);
        });
    });

    describe("createViewer", () => {
        it("pins the module order, winning providers, __init__ order, config and moddle of the defaults", async () => {
            const pins = await pinsOf(viewerBuild);

            expect.soft(overridesOf(pins.assembly)).toEqual(VIEWER_OVERRIDES);
            await expectPins("viewer", "createViewer, default options", pins);
        });

        it("pins what each option adds, removes or replaces", async () => {
            await expect(
                await optionDeltas("createViewer", viewerBuild, VIEWER_VARIANTS),
            ).toMatchFileSnapshot(`${PINS}/viewer.options.txt`);
        });
    });

    describe.each(ENGINES)("createTemplatePreview (%s)", (engine) => {
        it("pins what its modeler adds, removes or replaces against createModeler's defaults", async () => {
            const modelerPins = await pinsOf(modelerBuild(engine));
            const init = vi.spyOn(BpmnModeler.prototype, "init");
            const preview = await createTemplatePreview(mountWithPanel().panel);
            try {
                await preview.show(PREVIEW_TEMPLATES[engine], engine);
                const [modeler] = init.mock.contexts as BpmnModeler[];
                const pins = pinsOfSurface(modeler);

                expect.soft(overridesOf(pins.assembly)).toEqual(MODELER_OVERRIDES);
                expectPopupMenuAnnotationsOf(pins.assembly, engine);
                const title = `# createTemplatePreview (${engine}): what its modeler adds, removes or replaces against createModeler (${engine})`;
                await expect(
                    `${[title, "", ...deltaLines(optionDelta(modelerPins, pins))].join("\n")}\n`,
                ).toMatchFileSnapshot(`${PINS}/template-preview-${engine}.delta.txt`);
            } finally {
                await afterPaint();
                preview.destroy();
                init.mockRestore();
            }
        });
    });

    it("keeps no pin file that no test writes", () => {
        // Vitest reports obsolete `.snap` keys only, never a file toMatchFileSnapshot stopped writing.
        const files = Object.keys(import.meta.glob("./__snapshots__/presetModulePins/*")).map(
            (path) => path.slice(path.lastIndexOf("/") + 1),
        );

        expect(files.filter((file) => !PIN_FILES.includes(file))).toEqual([]);
    });
});
