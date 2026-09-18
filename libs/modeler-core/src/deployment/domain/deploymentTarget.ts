import { Engine } from "@miragon/bpmn-modeler-types";

import { InvalidDeploymentTargetsFileError } from "../../shared/domain/errors";

export type TargetAuthType = "none" | "basic" | "oauth2";

/**
 * A named, team-shareable deployment connection persisted in
 * `deployment-targets.json`. Holds only non-secret connection metadata —
 * credentials live in the host secret store keyed by the target's slot.
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
    ) {}

    toJson(): Record<string, unknown> {
        const auth: Record<string, unknown> = { type: this.authType };
        if (this.authType === "oauth2") {
            auth.tokenEndpoint = this.tokenEndpoint;
            auth.audience = this.audience;
        }

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

    /**
     * Inserts or replaces a target. `previousName` (a rename) removes the old
     * entry; identity is the trimmed `name`, matched case-sensitively.
     */
    upsert(target: DeploymentTarget, previousName?: string): DeploymentTarget[] {
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

    const { authType, tokenEndpoint, audience } = parseAuth(source.auth, index);
    const { deployUrl, startInstanceUrl } = parseEndpoints(source.endpoints, index);

    return new DeploymentTarget(
        name,
        engine,
        endpoint,
        tenantId,
        authType,
        tokenEndpoint,
        audience,
        deployUrl,
        startInstanceUrl,
    );
}

function parseAuth(
    raw: unknown,
    index: number,
): { authType: TargetAuthType; tokenEndpoint: string; audience: string } {
    if (raw === undefined) {
        return { authType: "none", tokenEndpoint: "", audience: "" };
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
    return {
        authType: type,
        tokenEndpoint: parseOptionalString(auth.tokenEndpoint, index, "auth.tokenEndpoint") ?? "",
        audience: parseOptionalString(auth.audience, index, "auth.audience") ?? "",
    };
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
