import { ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { EngineVersionStatus } from "../../../kernel/domain/BpmnDocument";
import { StatusView } from "../../../kernel/domain/statusView";
import { ENGINE_VERSION_STATUS_TOOLTIP } from "../../../kernel/domain/engineVersionStatus";

export function engineVersionStatusView(
    status: EngineVersionStatus | undefined,
): StatusView | undefined {
    if (!status) return undefined;
    return {
        text: `${ENGINE_LABEL[status.platform]} (${status.version})`,
        icon: "engine",
        tooltip: ENGINE_VERSION_STATUS_TOOLTIP,
        tone: "neutral",
        action: "changeEngineVersion",
    };
}
