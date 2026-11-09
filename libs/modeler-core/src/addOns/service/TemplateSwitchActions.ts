import { LoggerPort } from "../../kernel/port/hostPorts";
import { TemplatePreferenceStorePort } from "../../kernel/port/templatePreferencePorts";
import { AddOnActionResult, CATALOG_NOT_OFFERED } from "../domain/addOnRequests";
import {
    sourceSwitchTargetOf,
    TEMPLATE_SWITCH_FAILED,
    templateSwitchTargetOf,
    TemplateSwitchRequest,
    TemplateSwitchTarget,
} from "../domain/templateAddOnRequests";
import { ShownSource, ShownTemplate } from "../domain/templateAddOnViews";

/** What the latest build showed, which a switch is checked against. */
export interface ShownSwitches {
    readonly sources: ReadonlyMap<string, ShownSource>;
    readonly templates: ReadonlyMap<string, ShownTemplate>;
}

/** Turns a template, or every template of a source, on or off where its switches live. */
export class TemplateSwitchActions {
    /** @param store Absent: the host keeps no template switches, and the catalog offers none. */
    constructor(
        private readonly store: TemplatePreferenceStorePort | undefined,
        private readonly logger: LoggerPort,
    ) {}

    act(request: TemplateSwitchRequest, shown: ShownSwitches): Promise<AddOnActionResult> {
        switch (request.kind) {
            case "enable":
            case "disable":
                return this.write(
                    templateSwitchTargetOf(shown.templates, request.addOnId, request.kind),
                );
            case "enableTemplates":
            case "disableTemplates":
                return this.write(
                    sourceSwitchTargetOf(shown.sources, request.sourceId, request.kind),
                );
        }
    }

    private async write(target: TemplateSwitchTarget): Promise<AddOnActionResult> {
        if (target.kind === "refused") return target.result;
        if (this.store === undefined) return CATALOG_NOT_OFFERED;
        try {
            await this.store.change(target.change);
        } catch (error) {
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            return TEMPLATE_SWITCH_FAILED;
        }
        return target.result;
    }
}
