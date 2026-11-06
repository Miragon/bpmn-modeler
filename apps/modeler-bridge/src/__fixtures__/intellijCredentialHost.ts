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

/** A PasswordSafe entry, Kotlin's `Credentials(user, password)`. */
interface Credentials {
    readonly user: string;
    readonly password: string;
}

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
 * A map stands in for PasswordSafe and returns every entry as set; what
 * PasswordSafe does with an entry is the Kotlin half.
 */
export function intellijCredentialHost(): Rpc {
    const passwordSafe = new Map<string, Credentials>();
    const read = <Result>(entry: string, toResult: (credentials: Credentials) => Result) => {
        const credentials = passwordSafe.get(entry);
        return credentials === undefined ? null : toResult(credentials);
    };

    const handlers: Readonly<Record<string, (params: never) => unknown>> = {
        [METHODS.secretStoreSaveBasicAuth]: ({
            username,
            password,
            slot,
        }: SecretSaveBasicAuthParams) => {
            passwordSafe.set(deploymentEntry("basicAuth", slot), { user: username, password });
        },
        [METHODS.secretStoreGetBasicAuth]: ({ slot }: SecretGetParams) =>
            read(
                deploymentEntry("basicAuth", slot),
                ({ user, password }): BasicAuthCredentials => ({ username: user, password }),
            ),
        [METHODS.secretStoreSaveOAuth2]: ({
            clientId,
            clientSecret,
            slot,
        }: SecretSaveOAuth2Params) => {
            passwordSafe.set(deploymentEntry("oauth2", slot), {
                user: clientId,
                password: clientSecret,
            });
        },
        [METHODS.secretStoreGetOAuth2]: ({ slot }: SecretGetParams) =>
            read(deploymentEntry("oauth2", slot), ({ user, password }): OAuth2Credentials => ({
                clientId: user,
                clientSecret: password,
            })),
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
            passwordSafe.set(deploymentEntry(APPROVED_DESTINATIONS, slot), {
                user: APPROVED_DESTINATIONS,
                password: JSON.stringify(origins),
            });
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
            passwordSafe.set(serviceName(MARKETPLACE, host), { user: host, password: token });
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
