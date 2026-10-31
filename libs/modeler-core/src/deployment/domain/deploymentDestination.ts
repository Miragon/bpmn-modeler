import { isWithinRoot } from "../../kernel/domain/rootContainment";
import { AuthConfig } from "./deployment";
import { DeploymentTargetIdentity } from "./deploymentLedger";
import { StatusConnection } from "./deploymentStatusView";
import {
    DeploymentTarget,
    DeploymentTargets,
    TargetChange,
    TargetRequest,
} from "./deploymentTarget";
import { EnvLookup, EnvReferencing } from "./envRef";
import { DeploymentTargetChangedError } from "./errors";

const AD_HOC_NAME = "ad-hoc";
const MAX_SHOWN_NAME_LENGTH = 60;

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

/** The ad-hoc connection under the legacy unnamed state keys. */
export interface LegacyConnection {
    readonly endpoint: string;
    readonly tenantId: string;
}

/** What an accepted deploy remembers of the connection it ran against. */
export interface CredentialPersistence {
    readonly auth: AuthConfig;
    /** `undefined` keeps the credentials under the legacy unnamed keys. */
    readonly secretSlot: string | undefined;
    /** A named target's connection lives in the targets file, so only an ad-hoc one is remembered. */
    readonly legacyConnection: LegacyConnection | undefined;
}

/**
 * What a deploy, start or verification runs against, resolved once per
 * request: every rule that differs between a named target and the ad-hoc
 * connection is answered here.
 */
export type DeploymentDestination = NamedDestination | AdHocDestination;

/**
 * The file path keeps same-named targets of different projects apart in an
 * application-scoped secret store such as IntelliJ's PasswordSafe.
 */
export function targetSecretSlot(location: TargetsLocation, targetName: string): string {
    return `${location.filePath}::${targetName.trim()}`;
}

/** A target of the targets file at `location`. */
export class NamedDestination {
    readonly kind = "named" as const;

    constructor(
        readonly target: DeploymentTarget,
        readonly location: TargetsLocation,
    ) {}

    get secretSlot(): string {
        return targetSecretSlot(this.location, this.target.name);
    }

    /**
     * The project whose targets file holds the target. A document outside every
     * workspace folder gets no `.env`, and neither does a targets file that a
     * config folder like `../x` places outside its project.
     */
    dotEnvDirectory(workspaceFolder: string | undefined): string | undefined {
        const { filePath, projectDir } = this.location;
        return workspaceFolder !== undefined && isWithinRoot(filePath, projectDir)
            ? projectDir
            : undefined;
    }

    /** Approvals live beside the credentials, so they follow the slot. */
    get approvalSlot(): string {
        return this.secretSlot;
    }

    get connectionName(): string {
        return this.target.name;
    }

    get statusConnection(): StatusConnection {
        return { kind: "named", name: this.target.name };
    }

    /** On one shortened line, as the name comes from the shared file. */
    get connectionLabel(): string {
        const singleLine = this.target.name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}"]+/gu, " ").trim();
        const shortened =
            singleLine.length > MAX_SHOWN_NAME_LENGTH
                ? `${singleLine.slice(0, MAX_SHOWN_NAME_LENGTH)}…`
                : singleLine;
        return `target "${shortened}"`;
    }

    /** The shared file chooses where a named target sends, so every request is checked. */
    requiresApproval(_request: { carriesEnvValues(): boolean }): boolean {
        return true;
    }

    assertAdmits(request: TargetRequest): void {
        this.target.assertAdmits(request);
    }

    ledgerEnvRefs(): EnvReferencing {
        return DeploymentTargetIdentity.envRefsOfTarget(this.target);
    }

    ledgerIdentity(lookup: EnvLookup): DeploymentTargetIdentity {
        return DeploymentTargetIdentity.fromTarget(this.target, lookup);
    }

    credentialPersistence(auth: AuthConfig): CredentialPersistence {
        return { auth, secretSlot: this.secretSlot, legacyConnection: undefined };
    }
}

/** The connection the user typed into the form, outside the targets file. */
export class AdHocDestination {
    readonly kind = "adHoc" as const;
    readonly target = undefined;
    /** Ad-hoc requests share one approval slot, as they share one set of stored credentials. */
    readonly approvalSlot = AD_HOC_NAME;
    readonly connectionName = AD_HOC_NAME;
    readonly connectionLabel = "the ad-hoc connection";

    constructor(
        readonly endpoint: string,
        readonly tenantId: string,
    ) {}

    /** Only a deploy saves the form's endpoint, so before one the freshness refers to no connection. */
    get statusConnection(): StatusConnection {
        return this.endpoint.trim() === "" ? { kind: "none" } : { kind: "formValues" };
    }

    /** The endpoint was typed, so a nearer, possibly vendored targets file can't supply its variables. */
    dotEnvDirectory(workspaceFolder: string | undefined): string | undefined {
        return workspaceFolder;
    }

    /** A typed ad-hoc request is the user's own choice; one carrying `.env` values is not. */
    requiresApproval(request: { carriesEnvValues(): boolean }): boolean {
        return request.carriesEnvValues();
    }

    assertAdmits(_request: TargetRequest): void {
        // An ad-hoc request carries its own connection; no saved target constrains it.
    }

    ledgerEnvRefs(): EnvReferencing {
        return DeploymentTargetIdentity.envRefsOfAdHoc(this.endpoint, this.tenantId);
    }

    ledgerIdentity(lookup: EnvLookup): DeploymentTargetIdentity {
        return DeploymentTargetIdentity.adHoc(this.endpoint, this.tenantId, lookup);
    }

    credentialPersistence(auth: AuthConfig): CredentialPersistence {
        return {
            auth,
            secretSlot: undefined,
            legacyConnection: { endpoint: this.endpoint, tenantId: this.tenantId },
        };
    }
}

/** A target name the targets file does not hold, e.g. after a teammate renamed it. */
export class UnknownTarget {
    readonly kind = "unknown" as const;

    constructor(readonly name: string) {}
}

/** What a target name selects; each caller decides what an {@link UnknownTarget} means. */
export type DestinationResolution = DeploymentDestination | UnknownTarget;

/** A blank name selects the ad-hoc connection, so no targets file needs reading for it. */
export function namesTarget(targetName: string | undefined): targetName is string {
    return targetName !== undefined && targetName.trim() !== "";
}

/** Without a location there is no targets file, so no name can resolve. */
export function resolveNamedDestination(
    targetName: string,
    location: TargetsLocation | undefined,
    targets: DeploymentTargets,
): NamedDestination | UnknownTarget {
    const target = targets.find(targetName);
    return target === undefined || location === undefined
        ? new UnknownTarget(targetName.trim())
        : new NamedDestination(target, location);
}

/**
 * The webview checked a deploy or start against the target it names, so an
 * unknown one fails rather than running against a connection nobody reviewed.
 *
 * @throws {DeploymentTargetChangedError} for an unknown target.
 */
export function requestDestination<Resolved extends DeploymentDestination>(
    resolution: Resolved | UnknownTarget,
): Resolved {
    if (resolution.kind === "unknown") {
        throw new DeploymentTargetChangedError(
            "The deployment target no longer exists. Select a target again.",
        );
    }
    return resolution;
}

/** A hand-edited file may drop the active target; the remembered ad-hoc connection is active then. */
export function activeDestination<Resolved extends DeploymentDestination>(
    resolution: Resolved | UnknownTarget,
    rememberedAdHoc: AdHocDestination,
): Resolved | AdHocDestination {
    return resolution.kind === "unknown" ? rememberedAdHoc : resolution;
}

/** The form of an unknown target is prefilled with no credentials, not another connection's. */
export function prefillDestination<Resolved extends DeploymentDestination>(
    resolution: Resolved | UnknownTarget,
): Resolved | undefined {
    return resolution.kind === "unknown" ? undefined : resolution;
}

/** A targets file edit together with the file it was made in. */
export class TargetEdit {
    constructor(
        readonly change: TargetChange,
        readonly location: TargetsLocation,
    ) {}

    /** Ledger rows are keyed by name and host, so a retired target's rows would never match again. */
    get retiredDestination(): NamedDestination | undefined {
        const { retiredTarget } = this.change;
        return retiredTarget === undefined
            ? undefined
            : new NamedDestination(retiredTarget, this.location);
    }
}
