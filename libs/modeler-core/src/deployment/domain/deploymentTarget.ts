import { Engine } from "@miragon/bpmn-modeler-types";

import {
    DisallowedEnvReferenceError,
    DuplicateDeploymentTargetError,
    InvalidDeploymentConfigError,
    InvalidDeploymentTargetError,
    InvalidDeploymentTargetsFileError,
} from "./errors";
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

const NON_EMPTY_STRING = "must be a non-empty string";

export interface StoredCredentials {
    readonly username?: string;
    readonly password?: string;
    readonly clientId?: string;
    readonly clientSecret?: string;
}

/**
 * A target's `auth` section, holding only the fields and refs its type uses: a
 * token endpoint hidden under another type would otherwise be prefilled and
 * count as typed once the form switches the target to OAuth2.
 */
export type TargetAuth = NoTargetAuth | BasicTargetAuth | OAuth2TargetAuth;

export class NoTargetAuth {
    readonly type = "none" as const;
    readonly credentialRefs = CredentialRefs.none();

    authWith(_stored: StoredCredentials | undefined): AuthConfig {
        return new NoAuth();
    }

    knownUrls(): string[] {
        return [];
    }

    toJson(): Record<string, unknown> {
        return { type: this.type };
    }
}

export class BasicTargetAuth {
    readonly type = "basic" as const;
    readonly credentialRefs: CredentialRefs;

    constructor(credentialRefs: CredentialRefs) {
        this.credentialRefs = CredentialRefs.basic(
            credentialRefs.username,
            credentialRefs.password,
        );
    }

    authWith(stored: StoredCredentials | undefined): AuthConfig {
        const username = this.credentialRefs.username ?? storedLiteral(stored?.username);
        const password = this.credentialRefs.password ?? storedLiteral(stored?.password);
        if (username === undefined && password === undefined) {
            return new NoAuth();
        }
        return new BasicAuth(username ?? "", password ?? "");
    }

    knownUrls(): string[] {
        return [];
    }

    toJson(): Record<string, unknown> {
        const auth: Record<string, unknown> = { type: this.type };
        this.credentialRefs.writeTo(auth);
        return auth;
    }
}

export class OAuth2TargetAuth {
    readonly type = "oauth2" as const;
    readonly credentialRefs: CredentialRefs;

    constructor(
        readonly tokenEndpoint: string,
        readonly audience: string,
        credentialRefs: CredentialRefs,
    ) {
        this.credentialRefs = CredentialRefs.oauth2(
            credentialRefs.clientId,
            credentialRefs.clientSecret,
        );
    }

    authWith(stored: StoredCredentials | undefined): AuthConfig {
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

    knownUrls(): string[] {
        return [this.tokenEndpoint];
    }

    toJson(): Record<string, unknown> {
        const auth: Record<string, unknown> = {
            type: this.type,
            tokenEndpoint: this.tokenEndpoint,
            audience: this.audience,
        };
        this.credentialRefs.writeTo(auth);
        return auth;
    }
}

function targetAuthOf(
    type: TargetAuthType,
    tokenEndpoint: string,
    audience: string,
    credentialRefs: CredentialRefs,
): TargetAuth {
    if (type === "basic") {
        return new BasicTargetAuth(credentialRefs);
    }
    if (type === "oauth2") {
        return new OAuth2TargetAuth(tokenEndpoint, audience, credentialRefs);
    }
    return new NoTargetAuth();
}

/**
 * The engine and auth type are left to {@link DeploymentTarget.create} to
 * check: neither the file nor the form's protocol payload is checked on arrival.
 */
export interface DeploymentTargetFields {
    readonly name: string;
    readonly engine: unknown;
    readonly endpoint: string;
    readonly tenantId?: string;
    readonly authType: unknown;
    readonly tokenEndpoint?: string;
    readonly audience?: string;
    readonly deployUrl?: string;
    readonly startInstanceUrl?: string;
    readonly credentialRefs?: CredentialRefs;
}

/**
 * A named, team-shareable deployment connection persisted in
 * `deployment-targets.json`. Holds only non-secret connection metadata —
 * literal credentials live in the host secret store keyed by the target's slot,
 * whole-value `${env:…}` credentials in {@link credentialRefs}.
 */
export class DeploymentTarget {
    readonly auth: TargetAuth;

    /** Checks nothing; a target built from input goes through {@link create}. */
    constructor(
        readonly name: string,
        readonly engine: Engine,
        readonly endpoint: string,
        readonly tenantId: string,
        authType: TargetAuthType,
        tokenEndpoint: string,
        audience: string,
        readonly deployUrl?: string,
        readonly startInstanceUrl?: string,
        credentialRefs: CredentialRefs = CredentialRefs.none(),
    ) {
        this.auth = targetAuthOf(authType, tokenEndpoint, audience, credentialRefs);
    }

    /**
     * The endpoint and tenant are kept verbatim, as the file has always been read:
     * named ledger keys are built from the endpoint, so trimming it would orphan
     * the rows of a hand-edited file.
     *
     * @throws {InvalidDeploymentTargetError} for a blank name or endpoint, or an
     *   engine or auth type outside the known ones.
     * @throws {DisallowedEnvReferenceError} naming the JSON field of the offending reference.
     */
    static create(fields: DeploymentTargetFields): DeploymentTarget {
        const { engine, authType } = fields;
        const name = fields.name.trim();
        if (name === "") {
            throw new InvalidDeploymentTargetError("name", NON_EMPTY_STRING);
        }
        if (engine !== "c7" && engine !== "c8") {
            throw new InvalidDeploymentTargetError("engine", 'must be "c7" or "c8"');
        }
        if (fields.endpoint.trim() === "") {
            throw new InvalidDeploymentTargetError("endpoint", NON_EMPTY_STRING);
        }
        if (authType !== "none" && authType !== "basic" && authType !== "oauth2") {
            throw new InvalidDeploymentTargetError(
                "auth.type",
                'must be "none", "basic", or "oauth2"',
            );
        }
        const target = new DeploymentTarget(
            name,
            engine,
            fields.endpoint,
            fields.tenantId ?? "",
            authType,
            fields.tokenEndpoint ?? "",
            fields.audience ?? "",
            trimmedOrUndefined(fields.deployUrl),
            trimmedOrUndefined(fields.startInstanceUrl),
            fields.credentialRefs,
        );
        target.assertEnvRefsValid();
        return target;
    }

    get authType(): TargetAuthType {
        return this.auth.type;
    }

    get tokenEndpoint(): string {
        return this.auth.type === "oauth2" ? this.auth.tokenEndpoint : "";
    }

    get audience(): string {
        return this.auth.type === "oauth2" ? this.auth.audience : "";
    }

    get credentialRefs(): CredentialRefs {
        return this.auth.credentialRefs;
    }

    /**
     * File refs win over stored values, so a stale secret can't shadow a committed
     * ref. A ref found only in the store is ignored: the file is the sole
     * authority for refs, so one a teammate removed must not survive locally.
     */
    authWith(stored: StoredCredentials | undefined): AuthConfig {
        return this.auth.authWith(stored);
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
        const urls = [
            this.endpoint,
            this.deployUrl,
            this.startInstanceUrl,
            ...this.auth.knownUrls(),
        ];
        return CredentialDestinations.ofKnown(
            ...urls.filter((url): url is string => url !== undefined && !containsEnvRef(url)),
        );
    }

    private assertEnvRefsValid(): void {
        assertEnvRefsValid(this.endpoint, "endpoint");
        assertEnvRefsValid(this.tenantId, "tenantId");
        assertEnvRefsValid(this.tokenEndpoint, "auth.tokenEndpoint");
        assertEnvRefsValid(this.audience, "auth.audience");
        assertEnvRefsValid(this.deployUrl, "endpoints.deploy");
        assertEnvRefsValid(this.startInstanceUrl, "endpoints.startInstance");
    }

    toJson(): Record<string, unknown> {
        const json: Record<string, unknown> = {
            name: this.name,
            engine: this.engine,
            endpoint: this.endpoint,
            tenantId: this.tenantId,
            auth: this.auth.toJson(),
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

    const name = parseRequiredString(source.name, index, "name");
    const endpoint = parseRequiredString(source.endpoint, index, "endpoint");
    const tenantId = parseOptionalString(source.tenantId, index, "tenantId");

    const auth = parseAuth(source.auth, index);
    const endpoints = parseEndpoints(source.endpoints, index);

    try {
        return DeploymentTarget.create({
            name,
            engine: source.engine,
            endpoint,
            tenantId,
            ...auth,
            ...endpoints,
        });
    } catch (error) {
        if (
            error instanceof InvalidDeploymentTargetError ||
            error instanceof DisallowedEnvReferenceError
        ) {
            throw new InvalidDeploymentTargetsFileError(`targets[${index}] ${error.message}`);
        }
        throw error;
    }
}

interface ParsedAuth {
    authType: unknown;
    tokenEndpoint?: string;
    audience?: string;
    credentialRefs: CredentialRefs;
}

function parseAuth(raw: unknown, index: number): ParsedAuth {
    if (raw === undefined) {
        return { authType: "none", credentialRefs: CredentialRefs.none() };
    }
    if (typeof raw !== "object" || raw === null) {
        throw new InvalidDeploymentTargetsFileError(`targets[${index}] "auth" must be an object`);
    }
    const auth = raw as Record<string, unknown>;
    return {
        authType: auth.type,
        tokenEndpoint: parseOptionalString(auth.tokenEndpoint, index, "auth.tokenEndpoint"),
        audience: parseOptionalString(auth.audience, index, "auth.audience"),
        credentialRefs: parseCredentialRefs(auth, index),
    };
}

/**
 * Every field is validated so a literal secret under another auth type's key
 * still fails loudly; the target's {@link TargetAuth} keeps only its own refs.
 */
function parseCredentialRefs(auth: Record<string, unknown>, index: number): CredentialRefs {
    const username = parseCredentialRef(auth.username, index, "auth.username");
    const password = parseCredentialRef(auth.password, index, "auth.password");
    const clientId = parseCredentialRef(auth.clientId, index, "auth.clientId");
    const clientSecret = parseCredentialRef(auth.clientSecret, index, "auth.clientSecret");
    return auth.type === "oauth2"
        ? CredentialRefs.oauth2(clientId, clientSecret)
        : CredentialRefs.basic(username, password);
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

/** A blank value is rejected by {@link DeploymentTarget.create} with the same message. */
function parseRequiredString(raw: unknown, index: number, field: string): string {
    if (typeof raw !== "string") {
        throw new InvalidDeploymentTargetsFileError(
            `targets[${index}] "${field}" ${NON_EMPTY_STRING}`,
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

function trimmedOrUndefined(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
}
