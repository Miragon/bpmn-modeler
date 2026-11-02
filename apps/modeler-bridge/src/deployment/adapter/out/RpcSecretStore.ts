import { SecretStorePort } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { BasicAuthCredentials, OAuth2Credentials, SecretApprovedDestinations, SecretGetApprovedDestinationsParams, SecretSaveApprovedDestinationsParams } from "../../../protocol/domain/types";

/**
 * Routes the core's {@link SecretStorePort} to the host's PasswordSafe-backed
 * credential store. Unlike the fire-and-forget Notifier/StatusBar ports, all
 * calls are **requests**: the deployment service awaits a save before reporting
 * success and awaits a read before pre-filling the form, so each must resolve only
 * once the host has actually persisted/fetched the secret. A read maps a `null`
 * host result to `undefined` to satisfy the port's `| undefined` contract.
 */
export class RpcSecretStore implements SecretStorePort {
    constructor(private readonly rpc: Rpc) {}

    async saveBasicAuth(username: string, password: string, slot?: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveBasicAuth, { username, password, slot });
    }

    async getBasicAuth(slot?: string): Promise<BasicAuthCredentials | undefined> {
        const result = (await this.rpc.request(METHODS.secretStoreGetBasicAuth, {
            slot,
        })) as BasicAuthCredentials | null;
        return result ?? undefined;
    }

    async saveOAuth2(clientId: string, clientSecret: string, slot?: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveOAuth2, { clientId, clientSecret, slot });
    }

    async getOAuth2(slot?: string): Promise<OAuth2Credentials | undefined> {
        const result = (await this.rpc.request(METHODS.secretStoreGetOAuth2, {
            slot,
        })) as OAuth2Credentials | null;
        return result ?? undefined;
    }

    async getApprovedDestinations(slot: string): Promise<string[]> {
        const result = (await this.rpc.request(METHODS.secretStoreGetApprovedDestinations, {
            slot,
        } satisfies SecretGetApprovedDestinationsParams)) as SecretApprovedDestinations | null;
        return result?.origins ?? [];
    }

    async saveApprovedDestinations(slot: string, origins: string[]): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveApprovedDestinations, {
            slot,
            origins,
        } satisfies SecretSaveApprovedDestinationsParams);
    }

    async delete(slot: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreDelete, { slot });
    }
}
