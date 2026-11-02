import { RpcHandlerTable } from "../protocol/domain/rpcHandler";
import { Rpc } from "../transport/adapter/out/Rpc";

export function bindHandlers(rpc: Rpc, table: RpcHandlerTable): void {
    for (const [method, handler] of Object.entries(table)) {
        rpc.on(method, handler);
    }
}
