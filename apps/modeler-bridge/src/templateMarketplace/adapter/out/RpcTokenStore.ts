import { TokenStorePort } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { TokenStoreGetResult } from "../../../protocol/domain/types";

/**
 * Routes the core's {@link TokenStorePort} to the host's PasswordSafe-backed
 * marketplace token store. Like {@link RpcSecretStore}, both calls are
 * **requests**: the marketplace service awaits a read before deciding whether to
 * prompt, and awaits a write before its auth retry, so each must resolve only
 * once the host has actually fetched/persisted. A `null` host result maps to
 * `undefined` to satisfy the port's `| undefined` contract.
 */
export class RpcTokenStore implements TokenStorePort {
    constructor(private readonly rpc: Rpc) {}

    async getToken(host: string): Promise<string | undefined> {
        const result = (await this.rpc.request(METHODS.tokenStoreGet, {
            host,
        })) as TokenStoreGetResult | null;
        return result?.token ?? undefined;
    }

    async setToken(host: string, token: string): Promise<void> {
        await this.rpc.request(METHODS.tokenStoreSet, { host, token });
    }
}
