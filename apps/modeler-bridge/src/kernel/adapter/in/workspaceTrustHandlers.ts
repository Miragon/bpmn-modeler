import { METHODS } from "../../../protocol/domain/descriptor";
import { WorkspaceTrustSnapshot } from "../../../protocol/domain/kernelProtocol";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import { WorkspaceTrustMirror } from "../../port/WorkspaceTrustMirror";

/**
 * The project's trust, pushed after the IDE's trust changed and after every spawn.
 *
 * RPC (Host → Core): workspaceTrust/didChange.
 */
export function workspaceTrustHandlers(mirror: WorkspaceTrustMirror): RpcHandlerTable {
    return {
        [METHODS.workspaceTrustDidChange]: (params: WorkspaceTrustSnapshot) => {
            mirror.apply(params);
        },
    };
}
