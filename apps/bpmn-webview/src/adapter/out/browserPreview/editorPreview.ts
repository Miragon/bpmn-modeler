import {
    BpmnModelerSettingQuery,
    BpmnPluginsQuery,
    ElementTemplatesQuery,
    PropertiesPanelStateQuery,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";

import c7Samples from "../../../__fixtures__/c7-samples.json";
import c8Samples from "../../../__fixtures__/c8-samples.json";
import { mockPluginAssets } from "../../../__fixtures__/mock-plugins";

export function previewPlugins(search: string): BpmnPluginsQuery {
    return new BpmnPluginsQuery(mockPluginAssets(new URLSearchParams(search).get("plugins")));
}

export function previewElementTemplates(): ElementTemplatesQuery {
    return new ElementTemplatesQuery(
        [...(c7Samples as unknown as JSON[]), ...(c8Samples as unknown as JSON[])],
        [],
    );
}

export function previewModelerSettings(): BpmnModelerSettingQuery {
    return new BpmnModelerSettingQuery({
        alignToOrigin: false,
        showTransactionBoundaries: true,
        colorTheme: "light",
    });
}

export function previewPanelState(): PropertiesPanelStateQuery {
    return new PropertiesPanelStateQuery(true);
}

/** The preview page is always the active editor. */
export function previewFocus(): TakeFocusQuery {
    return new TakeFocusQuery();
}
