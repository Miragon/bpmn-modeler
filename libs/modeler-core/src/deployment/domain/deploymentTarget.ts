import { Engine } from "@miragon/bpmn-modeler-types";

import {
    DisallowedEnvReferenceError,
    DuplicateDeploymentTargetError,
    InvalidDeploymentConfigError,
    InvalidDeploymentTargetsFileError,
} from "../../shared/domain/errors";
import { CredentialDestinations } from "./credentialDestinations";
import { CredentialRefs } from "./credentialRefs";
import { AuthConfig, BasicAuth, NoAuth, OAuth2Auth } from "./deployment";
import {
    assertEnvRefsValid,
    containsEnvRef,
    ENV_VARIABLE_PREFIX,
    EnvLookup,
    EnvReferencing,
    envRefsIn,
    expandEnvRefs,
    isWholeEnvRef,
    wholeEnvRefOf,
} from "./envRef";

export type TargetAuthType = "none" | "basic" | "oauth2";

export interface StoredCredentials {
    readonly username?: string;
    readonly password?: string;
    readonly clientId?: string;
    readonly clientSecret?: string;
}

/**
 * A named, team-shareable deployment connection persisted in
 * `deployment-targets.json`. Holds only non-secret connection metadata —
 * literal credentials live in the host secret store keyed by the target's slot,
 * whole-value `${env:…}` credentials in {@link credentialRefs}.
 */
export class DeploymentTarget {
    constructor(
        readonly name: string,
        readonly engine: Engine,
        readonly endpoint: string,
        readonly tenantId: string,
        readonly authType: TargetAuthType,
        readonly tokenEndpoint: string,
        readonly audience: string,
        readonly deployUrl?: string,
        readonly startInstanceUrl?: string,
        readonly credentialRefs: CredentialRefs = CredentialRefs.none(),
    ) {}

    /**
     * File refs win over stored values, so a stale secret can't shadow a committed
     * ref. A ref found only in the store is ignored: the file is the sole
     * authority for refs, so one a teammate removed must not survive locally.
     */
    authWith(stored: StoredCredentials | undefined): AuthConfig {
        if (this.authType === "basic") {
            const username = this.credentialRefs.username ?? storedLiteral(stored?.username);
            const password = this.credentialRefs.password ?? storedLiteral(stored?.password);
            if (username === undefined && password === undefined) {
                return new NoAuth();
            }
            return new BasicAuth(username ?? "", password ?? "");
        }
        if (this.authType === "oauth2") {
            const clientId = this.credentialRefs.clientId ?? storedLiteral(stored?.clientId);
            const clientSecret =
                this.credentialRefs.clientSecret ?? storedLiteral(stored?.clientSecret);
            if (clientId === undefined && clientSecret === undefined) {
                return new NoAuth();
            }
            return new OAuth2Auth(
                clientId ?? "",
                clientSecret ?? "",
                this.tokenEndpoint,
                this.audience,
            );
        }
        return new NoAuth();
    }

    /** What {@link expandConnection} reads, so a lookup is only built when it needs one. */
    connectionEnvRefs(): EnvReferencing {
        return envRefsIn(this.endpoint, this.tenantId);
    }

    /**
     * Request-only expansion of the connection the engine inspection talks to.
     * A variable set to an empty value is rejected like an empty field.
     */
    expandConnection(lookup: EnvLookup): { endpoint: string; tenantId: string } {
        const endpoint = expandEnvRefs(this.endpoint, lookup, "endpoint");
        if (!endpoint.trim()) {
            throw new InvalidDeploymentConfigError(["endpoint"]);
        }
        return { endpoint, tenantId: expandEnvRefs(this.tenantId, lookup, "tenantId") };
    }

    /**
     * Where this target may send credentials, as far as is known without its
     * `.env`: what saving it through the form can approve.
     */
    knownCredentialDestinations(): CredentialDestinations {
        const urls = [this.endpoint, this.deployUrl, this.startInstanceUrl];
        if (this.authType === "oauth2") {
            urls.push(this.tokenEndpoint);
        }
        return CredentialDestinations.ofKnown(
            ...urls.filter((url): url is string => url !== undefined && !containsEnvRef(url)),
        );
    }

    /** @throws {DisallowedEnvReferenceError} naming the JSON field of the offending reference. */
    assertEnvRefsValid(): void {
        assertEnvRefsValid(this.endpoint, "endpoint");
        assertEnvRefsValid(this.tenantId, "tenantId");
        assertEnvRefsValid(this.tokenEndpoint, "auth.tokenEndpoint");
        assertEnvRefsValid(this.audience, "auth.audience");
        assertEnvRefsValid(this.deployUrl, "endpoints.deploy");
        assertEnvRefsValid(this.startInstanceUrl, "endpoints.startInstance");
    }

    toJson(): Record<string, unknown> {
        const auth: Record<string, unknown> = { type: this.authType };
        if (this.authType === "oauth2") {
            auth.tokenEndpoint = this.tokenEndpoint;
            auth.audience = this.audience;
        }
        this.credentialRefs.writeTo(auth);

        const json: Record<string, unknown> = {
            name: this.name,
            engine: this.engine,
            endpoint: this.endpoint,
            tenantId: this.tenantId,
            auth,
        };

        const endpoints: Record<string, string> = {};
        if (this.deployUrl) {
            endpoints.deploy = this.deployUrl;
        }
        if (this.startInstanceUrl) {
            endpoints.startInstance = this.startInstanceUrl;
        }
        if (Object.keys(endpoints).length > 0) {
            json.endpoints = endpoints;
        }

        return json;
    }
}

/**
 * Immutable collection of targets. Mutating operations return a fresh array so
 * callers can persist the new state without in-place aliasing.
 */
export class DeploymentTargets {
    constructor(readonly targets: readonly DeploymentTarget[]) {}

    find(name: string): DeploymentTarget | undefined {
        const normalized = name.trim();
        return this.targets.find((target) => target.name === normalized);
    }

    knownDestinations(): CredentialDestinations {
        return this.targets.reduce(
            (destinations, target) => destinations.union(target.knownCredentialDestinations()),
            CredentialDestinations.none(),
        );
    }

    /**
     * Appends a new target. Throws {@link DuplicateDeploymentTargetError} when
     * its name already exists so a create never silently overwrites.
     */
    add(target: DeploymentTarget): DeploymentTarget[] {
        if (this.find(target.name) !== undefined) {
            throw new DuplicateDeploymentTargetError(target.name);
        }
        return [...this.targets, target];
    }

    /**
     * Replaces a target in place. `previousName` (a rename) removes the old
     * entry; identity is the trimmed `name`, matched case-sensitively. A rename
     * onto another existing target's name throws
     * {@link DuplicateDeploymentTargetError}.
     */
    upsert(target: DeploymentTarget, previousName?: string): DeploymentTarget[] {
        const isRename = previousName !== undefined && previousName.trim() !== target.name;
        if (isRename && this.find(target.name) !== undefined) {
            throw new DuplicateDeploymentTargetError(target.name);
        }
        const removeNames = new Set<string>([target.name]);
        if (previousName !== undefined) {
            removeNames.add(previousName.trim());
        }
        const kept = this.targets.filter((existing) => !removeNames.has(existing.name));
        return [...kept, target];
    }

    remove(name: string): DeploymentTarget[] {
        const normalized = name.trim();
        return this.targets.filter((existing) => existing.name !== normalized);
    }
}

/**
 * Parses a `deployment-targets.json` file. This is a parser, not a cast: the
 * file is hand-editable and team-shared, so every field is re-validated and a
 * shape violation throws {@link InvalidDeploymentTargetsFileError} rather than
 * silently loading a half-broken target. Duplicate names are rejected so the
 * `name` identity stays unique.
 */
export function parseDeploymentTargetsFile(json: unknown): DeploymentTarget[] {
    if (typeof json !== "object" || json === null) {
        throw new InvalidDeploymentTargetsFileError("expected a JSON object");
    }

    const targets = (json as { targets?: unknown }).targets;
    if (!Array.isArray(targets)) {
        throw new InvalidDeploymentTargetsFileError("`targets` must be an array");
    }

    const parsed: DeploymentTarget[] = [];
    const seenNames = new Set<string>();
    targets.forEach((entry, index) => {
        const target = parseTarget(entry, index);
        if (seenNames.has(target.name)) {
            throw new InvalidDeploymentTargetsFileError(`duplicate target name "${target.name}"`);
        }
        seenNames.add(target.name);
        parsed.push(target);
    });
    return parsed;
}

function parseTarget(entry: unknown, index: number): DeploymentTarget {
    if (typeof entry !== "object" || entry === null) {
        throw new InvalidDeploymentTargetsFileError(`targets[${index}] must be an object`);
    }
    const source = entry as Record<string, unknown>;

    const name = parseRequiredString(source.name, index, "name").trim();
    if (name.length === 0) {
        throw new InvalidDeploymentTargetsFileError(`targets[${index}] "name" must be non-empty`);
    }

    const engine = source.engine;
    if (engine !== "c7" && engine !== "c8") {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "engine" must be "c7" or "c8"`,
        );
    }

    const endpoint = parseRequiredString(source.endpoint, index, "endpoint");
    const tenantId = parseOptionalString(source.tenantId, index, "tenantId") ?? "";

    const { authType, tokenEndpoint, audience, credentialRefs } = parseAuth(source.auth, index);
    const { deployUrl, startInstanceUrl } = parseEndpoints(source.endpoints, index);

    const target = new DeploymentTarget(
        name,
        engine,
        endpoint,
        tenantId,
        authType,
        tokenEndpoint,
        audience,
        deployUrl,
        startInstanceUrl,
        credentialRefs,
    );
    try {
        target.assertEnvRefsValid();
    } catch (error) {
        if (error instanceof DisallowedEnvReferenceError) {
            throw new InvalidDeploymentTargetsFileError(`targets[${index}] ${error.message}`);
        }
        throw error;
    }
    return target;
}

interface ParsedAuth {
    authType: TargetAuthType;
    tokenEndpoint: string;
    audience: string;
    credentialRefs: CredentialRefs;
}

function parseAuth(raw: unknown, index: number): ParsedAuth {
    if (raw === undefined) {
        return {
            authType: "none",
            tokenEndpoint: "",
            audience: "",
            credentialRefs: CredentialRefs.none(),
        };
    }
    if (typeof raw !== "object" || raw === null) {
        throw new InvalidDeploymentTargetsFileError(`targets[${index}] "auth" must be an object`);
    }
    const auth = raw as Record<string, unknown>;
    const type = auth.type;
    if (type !== "none" && type !== "basic" && type !== "oauth2") {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "auth.type" must be "none", "basic", or "oauth2"`,
        );
    }
    const tokenEndpoint = parseOptionalString(auth.tokenEndpoint, index, "auth.tokenEndpoint");
    const audience = parseOptionalString(auth.audience, index, "auth.audience");
    // Kept only where they are used: a hidden token endpoint would otherwise be
    // prefilled and count as typed once the form switches the target to OAuth2.
    return {
        authType: type,
        tokenEndpoint: type === "oauth2" ? (tokenEndpoint ?? "") : "",
        audience: type === "oauth2" ? (audience ?? "") : "",
        credentialRefs: parseCredentialRefs(auth, type, index),
    };
}

/**
 * Every field is validated so a literal secret under another auth type's key
 * still fails loudly; only the active type's refs are kept.
 */
function parseCredentialRefs(
    auth: Record<string, unknown>,
    type: TargetAuthType,
    index: number,
): CredentialRefs {
    const username = parseCredentialRef(auth.username, index, "auth.username");
    const password = parseCredentialRef(auth.password, index, "auth.password");
    const clientId = parseCredentialRef(auth.clientId, index, "auth.clientId");
    const clientSecret = parseCredentialRef(auth.clientSecret, index, "auth.clientSecret");
    if (type === "basic") {
        return CredentialRefs.basic(username, password);
    }
    if (type === "oauth2") {
        return CredentialRefs.oauth2(clientId, clientSecret);
    }
    return CredentialRefs.none();
}

function parseCredentialRef(raw: unknown, index: number, field: string): string | undefined {
    if (raw === undefined) {
        return undefined;
    }
    if (typeof raw !== "string") {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "${field}" must be a string`,
        );
    }
    if (!isWholeEnvRef(raw)) {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "${field}" must be a single environment reference like "\${env:${ENV_VARIABLE_PREFIX}NAME}" — use the form to store a literal secret`,
        );
    }
    return raw;
}

function parseEndpoints(
    raw: unknown,
    index: number,
): { deployUrl?: string; startInstanceUrl?: string } {
    if (raw === undefined) {
        return {};
    }
    if (typeof raw !== "object" || raw === null) {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "endpoints" must be an object`,
        );
    }
    const endpoints = raw as Record<string, unknown>;
    return {
        deployUrl: parseOptionalString(endpoints.deploy, index, "endpoints.deploy"),
        startInstanceUrl: parseOptionalString(
            endpoints.startInstance,
            index,
            "endpoints.startInstance",
        ),
    };
}

function parseRequiredString(raw: unknown, index: number, field: string): string {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "${field}" must be a non-empty string`,
        );
    }
    return raw;
}

function parseOptionalString(raw: unknown, index: number, field: string): string | undefined {
    if (raw === undefined) {
        return undefined;
    }
    if (typeof raw !== "string") {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "${field}" must be a string`,
        );
    }
    return raw;
}

export function serializeDeploymentTargets(targets: readonly DeploymentTarget[]): string {
    const json = { targets: targets.map((target) => target.toJson()) };
    return `${JSON.stringify(json, null, 2)}\n`;
}

function storedLiteral(value: string | undefined): string | undefined {
    return wholeEnvRefOf(value) === undefined ? value : undefined;
}
