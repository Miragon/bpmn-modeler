import { MarketplaceCommands, NotifierPort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import {
    MarketplaceAddParams,
    MarketplaceRemoveParams,
    MarketplaceUpdateParams,
} from "../../../protocol/domain/types";
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
    notifier,
    persistRegistration,
}: {
    commands: MarketplaceCommands;
    settingsMirror: HostSettingsMirror;
    notifier: NotifierPort;
    persistRegistration: (location: string, scope: MarketplaceAddParams["scope"]) => Promise<void>;
}): RpcHandlerTable {
    return {
        [METHODS.marketplaceAdd]: (params: MarketplaceAddParams) => {
            settingsMirror.apply(params.settings);
            notifier.logInfo("Add Marketplace command invoked");
            void commands.add(params.location, (location) =>
                persistRegistration(location, params.scope),
            );
        },
        [METHODS.marketplaceUpdate]: (params: MarketplaceUpdateParams) => {
            settingsMirror.apply(params.settings);
            void commands.update();
        },
        // The host already unregistered the entries; the applied snapshot is the
        // post-removal list the prune reads.
        [METHODS.marketplaceRemove]: (params: MarketplaceRemoveParams) => {
            settingsMirror.apply(params.settings);
            notifier.logInfo("Remove Marketplace command invoked");
            void commands.remove(params.removedCount);
        },
    };
}
