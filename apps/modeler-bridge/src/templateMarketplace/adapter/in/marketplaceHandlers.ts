import { MarketplaceCommands } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import { MarketplaceCommandParams } from "../../../protocol/domain/types";
import { HostSettingsMirror } from "../../../kernel/port/HostSettingsMirror";

/**
 * Each notification carries the host's fresh settings snapshot, applied first:
 * the flows read the marketplace list and the config folder from `SettingsPort`,
 * even before any editor opened.
 *
 * RPC (Host → Core): marketplace/add, marketplace/update, marketplace/remove.
 */
export function marketplaceHandlers({
    commands,
    settingsMirror,
}: {
    commands: MarketplaceCommands;
    settingsMirror: HostSettingsMirror;
}): RpcHandlerTable {
    const run = (flow: () => Promise<void>) => (params: MarketplaceCommandParams) => {
        settingsMirror.apply(params.settings);
        void flow();
    };
    return {
        [METHODS.marketplaceAdd]: run(() => commands.add()),
        [METHODS.marketplaceUpdate]: run(() => commands.update()),
        [METHODS.marketplaceRemove]: run(() => commands.remove()),
    };
}
