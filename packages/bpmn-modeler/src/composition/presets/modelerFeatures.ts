import {
    type Engine,
    engineSupports,
    isEngine,
    UnsupportedEngineError,
} from "@miragon/bpmn-modeler-types";

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
import { normalizeMode } from "../../kernel/domain/surfaceMode";
import type { FeatureEntry } from "../../kernel/port/bpmnSurface";
import { DrilldownFitModule } from "../../kernel/service/viewState";
import { layout } from "../../layout/adapter/in/layoutFeature";
import { minimap } from "../../minimap/adapter/in/minimapFeature";
import { modelNavigation } from "../../modelNavigation/adapter/in/modelNavigationFeature";
import type { ModelerCapabilities } from "../../modeler/port/capabilities";
import type { CreateModelerOptions } from "../../modeler/port/publicApi";
import { popupMenuAnnotations } from "../../popupMenuAnnotations/adapter/in/popupMenuAnnotationsModule";
import { propertiesPanel } from "../../propertiesPanel/adapter/in/propertiesPanelFeature";
import { tokenSimulation } from "../../tokenSimulation/adapter/in/tokenSimulationFeature";
import { transactionBoundaries } from "../../transactionBoundaries/adapter/in/transactionBoundariesFeature";
import { buildLintModules } from "../lintModules";

const ENGINE_FEATURES: Record<Engine, typeof camunda7> = { c7: camunda7, c8: camunda8 };

/** What only one engine lists, after the drill-down fit. */
const ENGINE_ONLY_FEATURES: Record<Engine, () => FeatureEntry[]> = {
    c7: () => [transactionBoundaries()],
    c8: () => [],
};

/** Fits the canvas when the user drills into a plane; the modeler preset's own. */
function drilldownFit(): BpmnFeature {
    return { id: "drilldownFit", modules: [DrilldownFitModule] };
}

function lint(options: CreateModelerOptions): BpmnFeature {
    return {
        id: "lint",
        modules: buildLintModules(
            options.linting,
            { engine: options.engine, mode: normalizeMode(options.mode) },
            { onLintResults: options.onLintResults, onLintingToggled: options.onLintingToggled },
        ),
    };
}

function capabilityFeatures(engine: Engine, capabilities: ModelerCapabilities = {}): BpmnFeature[] {
    const {
        modelNavigation: navigation,
        codeLink: link,
        definitionSearch: search,
        scripting,
    } = capabilities;
    const features: BpmnFeature[] = [];
    if (navigation) features.push(modelNavigation(navigation));
    if (link) features.push(codeLink(link));
    if (search) features.push(definitionSearch(search));
    if (scripting && engineSupports(engine, "inlineScripting")) {
        features.push(inlineScripting(scripting));
    }
    return features;
}

function callerFeature({ additionalModules, moddleExtensions }: CreateModelerOptions): BpmnFeature {
    return {
        id: "caller",
        modules: (additionalModules as unknown[] | undefined) ?? [],
        moddleExtensions: moddleExtensions as Record<string, object> | undefined,
    };
}

/**
 * `createModeler`'s features for `createSurface`, in order: the engine feature's
 * panel, behaviours and providers first, the templates after create-append-anything,
 * lint right after token simulation and the caller's last. The module pins hold
 * the order they flatten to.
 */
export function modelerFeatures(
    container: HTMLElement,
    options: CreateModelerOptions,
): FeatureEntry[] {
    const { engine } = options;
    if (!isEngine(engine)) {
        throw new UnsupportedEngineError(engine);
    }
    return [
        minimap(),
        executableFix(),
        nativeCopyPaste(),
        copyAsImage(),
        ENGINE_FEATURES[engine]({ engineVersion: options.engineVersion }),
        createAppendAnything(),
        elementTemplates(engine),
        alignToOrigin(),
        grid(),
        i18n(),
        tokenSimulation(),
        lint(options),
        appendMenu(),
        popupMenuAnnotations(),
        flowNavigation(),
        layout(),
        elementIds(),
        propertiesPanel({
            parent: options.propertiesPanel.parent,
            feelPopupContainer: container,
            mode: normalizeMode(options.mode),
        }),
        drilldownFit(),
        ...ENGINE_ONLY_FEATURES[engine](),
        ...capabilityFeatures(engine, options.capabilities),
        ...(options.clipboard ? [clipboard(options.clipboard)] : []),
        callerFeature(options),
    ];
}
