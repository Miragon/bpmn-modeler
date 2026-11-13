import { METHODS } from "../protocol/domain/descriptor";
import {
    BasicAuthCredentials,
    OAuth2Credentials,
    SecretApprovedDestinations,
    SecretDeleteParams,
    SecretGetApprovedDestinationsParams,
    SecretGetParams,
    SecretSaveApprovedDestinationsParams,
    SecretSaveBasicAuthParams,
    SecretSaveOAuth2Params,
    TokenStoreGetParams,
    TokenStoreGetResult,
    TokenStoreSetParams,
} from "../protocol/domain/types";
import { Rpc } from "../transport/adapter/out/Rpc";

/** A PasswordSafe entry, Kotlin's `Credentials(user, password)`, which keeps an empty user name as none. */
interface Credentials {
    readonly user: string | null;
    readonly password: string;
}

const credentials = (user: string, password: string): Credentials => ({
    user: user === "" ? null : user,
    password,
});

/** `SecretStoreRouter` answers a pair only when both halves are there. */
const pairOf = <Pair>(toPair: (user: string, password: string) => Pair) =>
    ({ user, password }: Credentials): Pair | null => (user === null ? null : toPair(user, password));

const DEPLOYMENT = "Miragon BPMN Modeler Deployment";
const MARKETPLACE = "Miragon BPMN Modeler Marketplace";
const APPROVED_DESTINATIONS = "approvedDestinations";

/** `generateServiceName(subsystem, key)`, which names a PasswordSafe entry. */
const serviceName = (subsystem: string, key: string) => `IntelliJ Platform ${subsystem} — ${key}`;

/** `IntellijSecretStore.attributesFor`: no slot keeps the legacy unnamed key. */
const deploymentEntry = (kind: string, slot: string | undefined) =>
    serviceName(DEPLOYMENT, slot === undefined ? kind : `${kind}:${slot}`);

/** The params each router reads with `params.string` or `params.jsonArray`. */
const REQUIRED_PARAMS: Readonly<Record<string, readonly string[]>> = {
    [METHODS.secretStoreSaveBasicAuth]: ["username", "password"],
    [METHODS.secretStoreSaveOAuth2]: ["clientId", "clientSecret"],
    [METHODS.secretStoreGetApprovedDestinations]: ["slot"],
    [METHODS.secretStoreSaveApprovedDestinations]: ["slot", "origins"],
    [METHODS.secretStoreDelete]: ["slot"],
    [METHODS.tokenStoreGet]: ["host"],
    [METHODS.tokenStoreSet]: ["host", "token"],
};

/** `JsonRpcParams.missing`: an absent or null required param fails the request. */
function assertRequiredParams(method: string, params: Readonly<Record<string, unknown>>): void {
    for (const key of REQUIRED_PARAMS[method] ?? []) {
        if (params[key] === undefined || params[key] === null) {
            throw new Error(`Param '${key}' is missing or not of the expected type`);
        }
    }
}

/** `RpcChannel.reply` and `replyError`: a handler that throws still answers its request. */
function replyTo(id: number, answer: () => unknown): string {
    try {
        return JSON.stringify({ id, result: answer() ?? null });
    } catch (error) {
        return JSON.stringify({ id, error: (error as Error).message });
    }
}

/**
 * Answers `secretStore/*` and `tokenStore/*` as the IntelliJ host's
 * `SecretStoreRouter` and `MarketplaceRouter` do: entries keyed as
 * `IntellijSecretStore` and `IntellijMarketplaceTokenStore` key them, `null`
 * for nothing stored, an error reply for a required param that is missing
 * (a slotless approvals read or delete included), and one reply per request
 * in request order, as the host's single credential-store thread sends them.
 * A map stands in for PasswordSafe: a pair saved with an empty name comes back
 * absent, one with an empty secret as saved. `SecretStoreRouterTest` runs
 * `intellijPasswordSafe.cases.json`, which this host answers too, on the
 * platform's in-memory PasswordSafe; what an OS keychain does with an empty
 * secret is not pinned.
 */
export function intellijCredentialHost(): Rpc {
    const passwordSafe = new Map<string, Credentials>();
    const read = <Result>(entry: string, toResult: (stored: Credentials) => Result | null) => {
        const stored = passwordSafe.get(entry);
        return stored === undefined ? null : toResult(stored);
    };

    const handlers: Readonly<Record<string, (params: never) => unknown>> = {
        [METHODS.secretStoreSaveBasicAuth]: ({
            username,
            password,
            slot,
        }: SecretSaveBasicAuthParams) => {
            passwordSafe.set(deploymentEntry("basicAuth", slot), credentials(username, password));
        },
        [METHODS.secretStoreGetBasicAuth]: ({ slot }: SecretGetParams) =>
            read(
                deploymentEntry("basicAuth", slot),
                pairOf((username, password): BasicAuthCredentials => ({ username, password })),
            ),
        [METHODS.secretStoreSaveOAuth2]: ({
            clientId,
            clientSecret,
            slot,
        }: SecretSaveOAuth2Params) => {
            passwordSafe.set(deploymentEntry("oauth2", slot), credentials(clientId, clientSecret));
        },
        [METHODS.secretStoreGetOAuth2]: ({ slot }: SecretGetParams) =>
            read(
                deploymentEntry("oauth2", slot),
                pairOf((clientId, clientSecret): OAuth2Credentials => ({ clientId, clientSecret })),
            ),
        [METHODS.secretStoreGetApprovedDestinations]: ({
            slot,
        }: SecretGetApprovedDestinationsParams) =>
            read(
                deploymentEntry(APPROVED_DESTINATIONS, slot),
                ({ password }): SecretApprovedDestinations => ({
                    origins: JSON.parse(password) as string[],
                }),
            ),
        [METHODS.secretStoreSaveApprovedDestinations]: ({
            slot,
            origins,
        }: SecretSaveApprovedDestinationsParams) => {
            passwordSafe.set(
                deploymentEntry(APPROVED_DESTINATIONS, slot),
                credentials(APPROVED_DESTINATIONS, JSON.stringify(origins)),
            );
        },
        [METHODS.secretStoreDelete]: ({ slot }: SecretDeleteParams) => {
            for (const kind of ["basicAuth", "oauth2", APPROVED_DESTINATIONS]) {
                passwordSafe.delete(deploymentEntry(kind, slot));
            }
        },
        [METHODS.tokenStoreGet]: ({ host }: TokenStoreGetParams) =>
            read(serviceName(MARKETPLACE, host), ({ password }): TokenStoreGetResult => ({
                token: password,
            })),
        [METHODS.tokenStoreSet]: ({ host, token }: TokenStoreSetParams) => {
            passwordSafe.set(serviceName(MARKETPLACE, host), credentials(host, token));
        },
    };

    const rpc: Rpc = new Rpc((line) => {
        const { id, method, params } = JSON.parse(line) as {
            id: number;
            method: string;
            params: never;
        };
        const reply = replyTo(id, () => {
            assertRequiredParams(method, params);
            return handlers[method](params);
        });
        queueMicrotask(() => void rpc.handleLine(reply));
    });
    return rpc;
}
