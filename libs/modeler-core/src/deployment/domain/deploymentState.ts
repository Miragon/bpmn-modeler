import { AuthConfig } from "./deployment";
import { DeployedRevision } from "./deploymentLedger";
import { isTargetAuthType, TargetAuthType } from "./deploymentTarget";

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

type DeploymentStateField = Exclude<keyof DeploymentState, "ledger">;

const FIELD_PARSERS: {
    readonly [K in DeploymentStateField]: (raw: unknown) => DeploymentState[K];
} = {
    endpoint: (raw) => stringOr(raw, DEFAULT_DEPLOYMENT_STATE.endpoint),
    tenantId: (raw) => stringOr(raw, DEFAULT_DEPLOYMENT_STATE.tenantId),
    authType: (raw) => (isTargetAuthType(raw) ? raw : DEFAULT_DEPLOYMENT_STATE.authType),
    tokenEndpoint: (raw) => stringOr(raw, DEFAULT_DEPLOYMENT_STATE.tokenEndpoint),
    audience: (raw) => stringOr(raw, DEFAULT_DEPLOYMENT_STATE.audience),
    activeTargetName: (raw) => stringOr(raw, DEFAULT_DEPLOYMENT_STATE.activeTargetName),
};

const FIELDS = Object.keys(FIELD_PARSERS) as DeploymentStateField[];

/**
 * The state as every host reads it: a missing value or one of the wrong type
 * reads as the default, and a ledger row that is not a revision is dropped.
 */
export function deploymentStateFrom(raw: RawDeploymentState): DeploymentState {
    return {
        endpoint: FIELD_PARSERS.endpoint(raw.endpoint),
        tenantId: FIELD_PARSERS.tenantId(raw.tenantId),
        authType: FIELD_PARSERS.authType(raw.authType),
        tokenEndpoint: FIELD_PARSERS.tokenEndpoint(raw.tokenEndpoint),
        audience: FIELD_PARSERS.audience(raw.audience),
        activeTargetName: FIELD_PARSERS.activeTargetName(raw.activeTargetName),
        ledger: ledgerFrom(raw.ledger),
    };
}

function ledgerFrom(raw: unknown): Record<string, DeployedRevision> {
    if (!isRecord(raw)) return {};
    return Object.fromEntries(
        Object.entries(raw).filter((entry): entry is [string, DeployedRevision] =>
            isDeployedRevision(entry[1]),
        ),
    );
}

function isDeployedRevision(row: unknown): row is DeployedRevision {
    return isRecord(row) && isString(row.fingerprint) && isString(row.deployedAt);
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
    patch: DeploymentStatePatch,
): DeploymentState {
    const fields = Object.fromEntries(
        patchedFields(patch).map((field) => [field, patch[field]]),
    ) as Partial<DeploymentState>;
    return {
        ...state,
        ...fields,
        ledger:
            patch.ledger === undefined ? state.ledger : patchedLedger(state.ledger, patch.ledger),
    };
}

function patchedLedger(
    ledger: DeploymentState["ledger"],
    { put, remove }: LedgerPatch,
): DeploymentState["ledger"] {
    const kept = Object.entries(ledger).filter(([key]) => !remove?.includes(key));
    return { ...Object.fromEntries(kept), ...put };
}

function patchedFields(patch: DeploymentStatePatch): DeploymentStateField[] {
    return FIELDS.filter((field) => patch[field] !== undefined);
}

/**
 * What an accepted ad-hoc deploy remembers of the connection it ran against.
 * Only an OAuth2 deploy writes the token endpoint and audience, so switching to
 * another auth type keeps them for the next OAuth2 deploy.
 */
export function connectionPatch(
    { endpoint, tenantId }: Pick<DeploymentState, "endpoint" | "tenantId">,
    auth: AuthConfig,
): DeploymentStatePatch {
    const connection = { endpoint, tenantId, authType: auth.type };
    return auth.type === "oauth2"
        ? { ...connection, tokenEndpoint: auth.tokenEndpoint, audience: auth.audience }
        : connection;
}

function stringOr(raw: unknown, fallback: string): string {
    return isString(raw) ? raw : fallback;
}

function isString(raw: unknown): raw is string {
    return typeof raw === "string";
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
    return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}
