import type { ModuleDeclaration } from "didi";
import MinimapModule from "diagram-js-minimap";
import ExecutableFixModule from "bpmn-js-executable-fix";
import NativeCopyPasteModule from "bpmn-js-native-copy-paste";
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from "bpmn-js-properties-panel";
import { CopyAsImageModule } from "bpmn-js-copy-as-image";
import AlignToOriginModule from "@bpmn-io/align-to-origin";
import GridModule from "diagram-js-grid";

const sharedLeadingModules: readonly ModuleDeclaration[] = [
    MinimapModule,
    ExecutableFixModule,
    NativeCopyPasteModule,
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    CopyAsImageModule,
];

// After the engine modules: the order the C7/C8 Modelers of camunda-bpmn-js shipped and we kept.
const sharedTrailingModules: readonly ModuleDeclaration[] = [AlignToOriginModule, GridModule];

export function composeUpstreamModules(
    engineUpstreamModules: readonly ModuleDeclaration[],
): readonly ModuleDeclaration[] {
    return [...sharedLeadingModules, ...engineUpstreamModules, ...sharedTrailingModules];
}
