import { AuthConfig } from "./deployment";
import { DeploymentTargetIdentity } from "./deploymentLedger";
import {
    DeploymentTarget,
    DeploymentTargets,
    TargetChange,
    TargetRequest,
} from "./deploymentTarget";
import { EnvLookup, EnvReferencing } from "./envRef";

/**
 * Where the `.env` comes from: a named target reads the one beside its targets
 * file's config folder; an ad-hoc request — whose endpoint the user typed —
 * reads the one at its workspace folder, so a nested targets file can't supply
 * variables for it.
 */
export type EnvScope = "targetsFile" | "workspaceFolder";

/**
 * Where the targets file lives for the current context. `filePath` is the read
 * location (nearest existing file) and the write location (the same file, or a
 * fresh one under the workspace config folder when none exists yet).
 */
export interface TargetsLocation {
    readonly filePath: string;
    readonly exists: boolean;
    /** The directory holding the config folder; its `.env` is the only one the targets may read. */
    readonly projectDir: string;
}

/** What an accepted deploy remembers of the connection it ran against. */
export interface CredentialPersistence {
    readonly auth: AuthConfig;
    readonly secretSlot: string | undefined;
    readonly legacyConnection: { readonly endpoint: string; readonly tenantId: string } | undefined;
}

export type DeploymentDestination = NamedDestination | AdHocDestination;

export function targetSecretSlot(_location: TargetsLocation, _targetName: string): string {
    return undefined as never;
}

export class NamedDestination {
    readonly kind = "named" as const;

    constructor(
        readonly target: DeploymentTarget,
        readonly location: TargetsLocation,
    ) {}

    get envScope(): EnvScope {
        return undefined as never;
    }

    get secretSlot(): string {
        return undefined as never;
    }

    get approvalSlot(): string {
        return undefined as never;
    }

    get connectionName(): string {
        return undefined as never;
    }

    get connectionLabel(): string {
        return undefined as never;
    }

    requiresApproval(_request: { carriesEnvValues(): boolean }): boolean {
        return undefined as never;
    }

    assertAdmits(_request: TargetRequest): void {
        // Stub until the destinations decide.
    }

    ledgerEnvRefs(): EnvReferencing {
        return { referencesEnv: () => undefined as never };
    }

    ledgerIdentity(_lookup: EnvLookup): DeploymentTargetIdentity {
        return undefined as never;
    }

    credentialPersistence(_auth: AuthConfig): CredentialPersistence {
        return undefined as never;
    }
}

export class AdHocDestination {
    readonly kind = "adHoc" as const;
    readonly target = undefined;

    constructor(
        readonly endpoint: string,
        readonly tenantId: string,
    ) {}

    get envScope(): EnvScope {
        return undefined as never;
    }

    get approvalSlot(): string {
        return undefined as never;
    }

    get connectionName(): string {
        return undefined as never;
    }

    get connectionLabel(): string {
        return undefined as never;
    }

    requiresApproval(_request: { carriesEnvValues(): boolean }): boolean {
        return undefined as never;
    }

    assertAdmits(_request: TargetRequest): void {
        // Stub until the destinations decide.
    }

    ledgerEnvRefs(): EnvReferencing {
        return { referencesEnv: () => undefined as never };
    }

    ledgerIdentity(_lookup: EnvLookup): DeploymentTargetIdentity {
        return undefined as never;
    }

    credentialPersistence(_auth: AuthConfig): CredentialPersistence {
        return undefined as never;
    }
}

export class UnknownTarget {
    readonly kind = "unknown" as const;

    constructor(readonly name: string) {}
}

export type DestinationResolution = DeploymentDestination | UnknownTarget;

export function namesTarget(targetName: string | undefined): targetName is string {
    return targetName === null;
}

export function resolveNamedDestination(
    targetName: string,
    _location: TargetsLocation | undefined,
    _targets: DeploymentTargets,
): NamedDestination | UnknownTarget {
    return new UnknownTarget(targetName);
}

export function requestDestination(resolution: DestinationResolution): DeploymentDestination {
    return resolution as DeploymentDestination;
}

export function activeDestination(
    resolution: DestinationResolution,
    _adHoc: AdHocDestination,
): DeploymentDestination {
    return resolution as DeploymentDestination;
}

export function prefillDestination(
    resolution: DestinationResolution,
): DeploymentDestination | undefined {
    return resolution as DeploymentDestination;
}

export class TargetEdit {
    constructor(
        readonly change: TargetChange,
        readonly location: TargetsLocation,
    ) {}

    get retiredDestination(): NamedDestination | undefined {
        return undefined;
    }
}
