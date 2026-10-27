import { EngineVersionStatus } from "../../../kernel/domain/BpmnDocument";
import { StatusView } from "../../../kernel/domain/statusView";

export function engineVersionStatusView(
    _status: EngineVersionStatus | undefined,
): StatusView | undefined {
    return undefined;
}
