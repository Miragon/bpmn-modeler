import { Engine } from "@miragon/bpmn-modeler-types";

import {
    DeploymentTargetChangedError,
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

const TARGET_AUTH_TYPES = ["none", "basic", "oauth2"] as const;

export type TargetAuthType = (typeof TARGET_AUTH_TYPES)[number];

export function isTargetAuthType(raw: unknown): raw is TargetAuthType {
    return TARGET_AUTH_TYPES.some((type) => type === raw);
}

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

    matchesSettingsOf(auth: AuthConfig): boolean {
        return auth.type === this.type;
    }

    knownUrls(): string[] {
        return [];
    }

    assertEnvRefsValid(): void {
        // No connection field that could carry a reference.
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

    matchesSettingsOf(auth: AuthConfig): boolean {
        return auth.type === this.type;
    }

    knownUrls(): string[] {
        return [];
    }

    assertEnvRefsValid(): void {
        // No connection field that could carry a reference.
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

    matchesSettingsOf(auth: AuthConfig): boolean {
        return (
            auth.type === this.type &&
            sameTrimmed(auth.tokenEndpoint, this.tokenEndpoint) &&
            sameTrimmed(auth.audience, this.audience)
        );
    }

    knownUrls(): string[] {
        return [this.tokenEndpoint];
    }

    assertEnvRefsValid(): void {
        assertEnvRefsValid(this.tokenEndpoint, "auth.tokenEndpoint");
        assertEnvRefsValid(this.audience, "auth.audience");
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

/** What a deploy or start-instance request sends, with only the target settings its operation uses. */
export type TargetRequest = DeployTargetRequest | StartInstanceTargetRequest;

interface TargetConnectionRequest {
    readonly endpoint: string;
    readonly engine: Engine;
    readonly auth: AuthConfig;
}

interface DeployTargetRequest extends TargetConnectionRequest {
    readonly kind: "deploy";
    readonly tenantId: string;
    readonly deployUrl?: string;
}

interface StartInstanceTargetRequest extends TargetConnectionRequest {
    readonly kind: "startInstance";
    readonly startInstanceUrl?: string;
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
        if (!isTargetAuthType(authType)) {
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

    /**
     * A request runs only against the target as saved: only a saved target is
     * reviewable, and the webview cannot prove which target a request means.
     * Values compare trimmed, so the padding of a hand-edited file is no change.
     *
     * @throws {DeploymentTargetChangedError} for a changed connection, and only
     *   then for credential refs the saved target does not hold.
     */
    assertAdmits(request: TargetRequest): void {
        if (!this.matchesConnectionOf(request)) {
            throw new DeploymentTargetChangedError(
                "The deployment target changed. Save or reload the target before continuing.",
            );
        }
        if (!this.credentialRefs.admits(request.auth)) {
            throw new DeploymentTargetChangedError(
                "Credential environment references differ from the saved target. Save or reload the target before continuing.",
            );
        }
    }

    private matchesConnectionOf(request: TargetRequest): boolean {
        const operationSettingsMatch =
            request.kind === "deploy"
                ? sameTrimmed(request.tenantId, this.tenantId) &&
                  sameTrimmed(request.deployUrl, this.deployUrl)
                : sameTrimmed(request.startInstanceUrl, this.startInstanceUrl);
        return (
            sameTrimmed(request.endpoint, this.endpoint) &&
            request.engine === this.engine &&
            this.auth.matchesSettingsOf(request.auth) &&
            operationSettingsMatch
        );
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
        this.auth.assertEnvRefsValid();
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
 * What one edit of the targets file does, with the targets to write: the
 * services retire the slot and ledger rows it names and carry over the
 * approvals it names.
 */
export type TargetChange = TargetCreated | TargetSaved | TargetRenamed | TargetRemoved;

/** A target under a name the file did not hold. */
export class TargetCreated {
    readonly kind = "created" as const;
    readonly before = undefined;
    readonly retiredTarget = undefined;
    readonly retiredSlotName = undefined;
    /** A stale slot under the new name must not lend its approvals. */
    readonly approvalsInheritedFrom = undefined;

    constructor(
        readonly targets: readonly DeploymentTarget[],
        readonly target: DeploymentTarget,
    ) {}
}

export class TargetSaved {
    readonly kind = "saved" as const;
    readonly retiredTarget = undefined;
    readonly retiredSlotName = undefined;

    constructor(
        readonly targets: readonly DeploymentTarget[],
        readonly target: DeploymentTarget,
        readonly before: DeploymentTarget,
    ) {}

    get approvalsInheritedFrom(): string {
        return this.before.name;
    }
}

/**
 * Ledger rows are keyed by name, so the old target's rows go with its slot.
 * `before` is undefined when the file no longer held the old name; its slot
 * is retired all the same.
 */
export class TargetRenamed {
    readonly kind = "renamed" as const;

    constructor(
        readonly targets: readonly DeploymentTarget[],
        readonly target: DeploymentTarget,
        readonly previousName: string,
        readonly before: DeploymentTarget | undefined,
    ) {}

    get retiredTarget(): DeploymentTarget | undefined {
        return this.before;
    }

    get retiredSlotName(): string {
        return this.previousName;
    }

    get approvalsInheritedFrom(): string | undefined {
        return this.before?.name;
    }
}

/** `before` is undefined when the file no longer held the name; its slot is retired all the same. */
export class TargetRemoved {
    readonly kind = "removed" as const;
    readonly approvalsInheritedFrom = undefined;

    constructor(
        readonly targets: readonly DeploymentTarget[],
        readonly name: string,
        readonly before: DeploymentTarget | undefined,
    ) {}

    get retiredTarget(): DeploymentTarget | undefined {
        return this.before;
    }

    get retiredSlotName(): string {
        return this.name;
    }
}

/**
 * Immutable collection of targets. An edit returns its {@link TargetChange},
 * holding a fresh array so callers can persist the new state without in-place
 * aliasing.
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
    add(target: DeploymentTarget): TargetCreated {
        if (this.find(target.name) !== undefined) {
            throw new DuplicateDeploymentTargetError(target.name);
        }
        return new TargetCreated([...this.targets, target], target);
    }

    /**
     * Saves `target` over the entry of its name, or of `previousName` for a
     * rename, and moves it to the end. Identity is the trimmed `name`, matched
     * case-sensitively. A rename onto another existing target's name throws
     * {@link DuplicateDeploymentTargetError}.
     */
    upsert(target: DeploymentTarget, previousName?: string): TargetChange {
        const savedName = previousName?.trim() ?? target.name;
        const isRename = savedName !== target.name;
        if (isRename && this.find(target.name) !== undefined) {
            throw new DuplicateDeploymentTargetError(target.name);
        }
        const before = this.find(savedName);
        const targets = [...this.targets.filter((existing) => existing.name !== savedName), target];
        if (isRename) {
            return new TargetRenamed(targets, target, savedName, before);
        }
        return before === undefined
            ? new TargetCreated(targets, target)
            : new TargetSaved(targets, target, before);
    }

    remove(name: string): TargetRemoved {
        const normalized = name.trim();
        return new TargetRemoved(
            this.targets.filter((existing) => existing.name !== normalized),
            normalized,
            this.find(normalized),
        );
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

/** Every key is validated, so a literal secret under another auth type's key still fails loudly. */
function parseCredentialRefs(auth: Record<string, unknown>, index: number): CredentialRefs {
    return CredentialRefs.ofFields({
        username: parseCredentialRef(auth.username, index, "auth.username"),
        password: parseCredentialRef(auth.password, index, "auth.password"),
        clientId: parseCredentialRef(auth.clientId, index, "auth.clientId"),
        clientSecret: parseCredentialRef(auth.clientSecret, index, "auth.clientSecret"),
    });
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

function sameTrimmed(requested: string | undefined, saved: string | undefined): boolean {
    return (requested ?? "").trim() === (saved ?? "").trim();
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
}
