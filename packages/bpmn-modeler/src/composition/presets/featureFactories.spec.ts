import AlignToOriginModule from "@bpmn-io/align-to-origin";
import ExecutableFixModule from "bpmn-js-executable-fix";
import NativeCopyPasteModule from "bpmn-js-native-copy-paste";
import { CopyAsImageModule } from "bpmn-js-copy-as-image";
import { CreateAppendAnythingModule } from "bpmn-js-create-append-anything";
import MinimapModule from "diagram-js-minimap";
import GridModule from "diagram-js-grid";
import { describe, expect, it, vi } from "vitest";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import { ElementIdsModule } from "@miragon/bpmn-modeler-element-ids";
import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";
import { createCodeLinkModule } from "@miragon/bpmn-modeler-code-link";
import { createDefinitionSearchModule } from "@miragon/bpmn-modeler-definition-search";
import { createInlineScriptingModules } from "@miragon/bpmn-modeler-inline-scripting";
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";

import { alignToOrigin } from "../../alignToOrigin/adapter/in/alignToOriginFeature";
import { appendMenu, createAppendAnything } from "../../appendMenu/adapter/in/appendMenuFeatures";
import { nativeCopyPaste } from "../../clipboard/adapter/in/clipboardFeature";
import { codeLink } from "../../codeLink/adapter/in/codeLinkFeature";
import { copyAsImage } from "../../copyAsImage/adapter/in/copyAsImageFeature";
import { definitionSearch } from "../../definitionSearch/adapter/in/definitionSearchFeature";
import { elementIds } from "../../elementIds/adapter/in/elementIdsFeature";
import { executableFix } from "../../executableFix/adapter/in/executableFixFeature";
import { flowNavigation } from "../../flowNavigation/adapter/in/flowNavigationFeature";
import { grid } from "../../grid/adapter/in/gridFeature";
import { inlineScripting } from "../../inlineScripting/adapter/in/inlineScriptingFeature";
import { layout } from "../../layout/adapter/in/layoutFeature";
import { minimap } from "../../minimap/adapter/in/minimapFeature";
import { modelNavigation } from "../../modelNavigation/adapter/in/modelNavigationFeature";
import { tokenSimulation } from "../../tokenSimulation/adapter/in/tokenSimulationFeature";
import { TokenSimulationBehaviorNamesModule } from "../../tokenSimulation/adapter/in/tokenSimulationBehaviorNamesModule";

const modelNavigationPort = { openReference: vi.fn() };
const codeLinkPort = { navigateToImplementation: vi.fn(), syncActivities: vi.fn() };
const definitionSearchPort = { search: vi.fn(async () => []) };
const scriptingPort = { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() };

describe("the modeler's feature factories", () => {
    it.each([
        ["minimap", minimap, [MinimapModule]],
        ["executableFix", executableFix, [ExecutableFixModule]],
        ["nativeCopyPaste", nativeCopyPaste, [NativeCopyPasteModule]],
        ["copyAsImage", copyAsImage, [CopyAsImageModule]],
        ["createAppendAnything", createAppendAnything, [CreateAppendAnythingModule]],
        ["grid", grid, [GridModule]],
        ["tokenSimulation", tokenSimulation, [TokenSimulationBehaviorNamesModule]],
        ["flowNavigation", flowNavigation, [FlowNavigationModule]],
        ["layout", layout, [createBpmnLayoutModule()]],
        ["elementIds", elementIds, [ElementIdsModule]],
    ])("%s registers its modules and needs nothing", (id, factory, modules) => {
        expect(factory()).toEqual({ id, modules });
    });

    it("appendMenu requires the upstream append menu it replaces", () => {
        expect(appendMenu()).toEqual({
            id: "appendMenu",
            modules: [AppendMenuModule],
            requires: ["appendMenuProvider"],
        });
    });

    it("alignToOrigin aligns only when asked", () => {
        expect(alignToOrigin()).toEqual({
            id: "alignToOrigin",
            modules: [AlignToOriginModule],
            config: { alignToOrigin: { alignOnSave: false, offset: 150, tolerance: 50 } },
        });
    });

    it.each([
        [
            "modelNavigation",
            () => modelNavigation(modelNavigationPort),
            [createModelNavigationModule(modelNavigationPort)],
            undefined,
        ],
        ["codeLink", () => codeLink(codeLinkPort), [createCodeLinkModule(codeLinkPort)], undefined],
        [
            "definitionSearch",
            () => definitionSearch(definitionSearchPort),
            [createDefinitionSearchModule(definitionSearchPort)],
            ["propertiesPanel"],
        ],
        [
            "inlineScripting",
            () => inlineScripting(scriptingPort),
            createInlineScriptingModules(scriptingPort),
            ["propertiesPanel"],
        ],
    ])("%s carries its host port in its modules", (id, factory, modules, requires) => {
        expect(factory()).toEqual({ id, modules, ...(requires && { requires }) });
    });
});
