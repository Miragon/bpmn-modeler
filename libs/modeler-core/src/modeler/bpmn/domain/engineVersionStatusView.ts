import { ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { EngineVersionStatus } from "../../../kernel/domain/BpmnDocument";
import { StatusView } from "../../../kernel/domain/statusView";

export function engineVersionStatusView(
    status: EngineVersionStatus | undefined,
): StatusView | undefined {
    if (!status) return undefined;
    return {
        text: `${ENGINE_LABEL[status.platform]} (${status.version})`,
        icon: "engine",
        tooltip: "Click to change engine version",
        tone: "neutral",
        action: "changeEngineVersion",
    };
}
