import { AuthConfig } from "./deployment";
import { DeployedRevision } from "./deploymentLedger";
import { TargetAuthType } from "./deploymentTarget";

/**
 * The non-secret deployment state a host keeps per workspace: the ad-hoc
 * connection the form last deployed with, the active target and the freshness
 * ledger. The credentials live in `SecretStorePort`.
 */
export interface DeploymentState {
    readonly endpoint: string;
    readonly tenantId: string;
    readonly authType: TargetAuthType;
    readonly tokenEndpoint: string;
    readonly audience: string;
    /** `""` selects the ad-hoc connection. */
    readonly activeTargetName: string;
    /** Keyed by `ledgerKeyFor`. */
    readonly ledger: Readonly<Record<string, DeployedRevision>>;
}

export const DEFAULT_DEPLOYMENT_STATE: DeploymentState = Object.freeze({
    endpoint: "",
    tenantId: "",
    authType: "none",
    tokenEndpoint: "",
    audience: "",
    activeTargetName: "",
    ledger: Object.freeze({}),
});

/** State as a host hands it over: any key may be missing or hold any value. */
export type RawDeploymentState = Partial<Record<keyof DeploymentState, unknown>>;

export function deploymentStateFrom(raw: RawDeploymentState): DeploymentState {
    return raw as unknown as DeploymentState;
}

/** A ledger write. `remove` runs before `put`, so a key in both is put. */
export interface LedgerPatch {
    readonly put?: Readonly<Record<string, DeployedRevision>>;
    readonly remove?: readonly string[];
}

/** One save: a field the patch leaves out keeps its stored value. */
export type DeploymentStatePatch = Partial<Omit<DeploymentState, "ledger">> & {
    readonly ledger?: LedgerPatch;
};

export function applyDeploymentStatePatch(
    state: DeploymentState,
    _patch: DeploymentStatePatch,
): DeploymentState {
    return state;
}

/** The keys a patch writes, in state order, for a host that stores each key on its own. */
export function patchedKeys(_patch: DeploymentStatePatch): (keyof DeploymentState)[] {
    return [];
}

/** What an accepted ad-hoc deploy remembers of the connection it ran against. */
export function connectionPatch(
    _connection: Pick<DeploymentState, "endpoint" | "tenantId">,
    _auth: AuthConfig,
): DeploymentStatePatch {
    return {};
}
