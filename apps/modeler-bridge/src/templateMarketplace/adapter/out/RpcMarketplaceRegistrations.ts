import {
    MarketplaceRegistrations,
    MarketplaceRegistrationsPort,
    MarketplaceScope,
    MarketplaceSettingsEntry,
} from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import {
    MarketplaceStateReadResult,
    MarketplaceStateRemoveParams,
    MarketplaceStateSaveParams,
} from "../../../protocol/domain/types";

/**
 * IntelliJ's application and project stores. Each write is acknowledged only
 * after the host pushed the fresh settings snapshot to this bridge, so the
 * settings mirror the prune reads already holds the new list.
 */
export class RpcMarketplaceRegistrations implements MarketplaceRegistrationsPort {
    constructor(private readonly rpc: Rpc) {}

    async read(): Promise<MarketplaceRegistrations> {
        return (await this.rpc.request(METHODS.marketplaceStateRead, {})) as MarketplaceStateReadResult;
    }

    async register(location: string, scope: MarketplaceScope): Promise<void> {
        await this.rpc.request(METHODS.marketplaceStateSave, {
            location,
            scope,
        } satisfies MarketplaceStateSaveParams);
    }

    async unregister(entries: readonly MarketplaceSettingsEntry[]): Promise<void> {
        await this.rpc.request(METHODS.marketplaceStateRemove, {
            entries: [...entries],
        } satisfies MarketplaceStateRemoveParams);
    }
}
