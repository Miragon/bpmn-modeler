/**
 * The files that describe a plugin, in the order they are read: our own
 * manifest, then the `index.js` of a Camunda Modeler plugin.
 */
export const PLUGIN_MANIFEST_FILES = ["plugin.json", "index.js"] as const;

export type PluginManifestFile = (typeof PLUGIN_MANIFEST_FILES)[number];

export interface PluginManifest {
    readonly name: string;
    /** Relative to the plugin folder, without a leading `./`. */
    readonly script: string;
    readonly style?: string;
}

export type PluginManifestReading =
    | { readonly kind: "manifest"; readonly manifest: PluginManifest }
    | { readonly kind: "unreadable"; readonly reason: string };

interface ManifestFields {
    readonly name?: string;
    readonly script?: string;
    readonly style?: string;
}

/**
 * Reads what a plugin folder declares. A Camunda `index.js` is Node code that
 * Camunda runs in its main process; it is scanned, never run, because the
 * user has not approved the plugin yet when it is read.
 */
export function readPluginManifest(
    file: PluginManifestFile,
    text: string,
    folderName: string,
): PluginManifestReading {
    const fields = MANIFEST_READERS[file](text);
    if ("reason" in fields) {
        return { kind: "unreadable", reason: fields.reason };
    }
    if (fields.script === undefined) {
        return { kind: "unreadable", reason: MISSING_SCRIPT_REASON[file] };
    }
    for (const path of [fields.script, fields.style]) {
        if (path !== undefined && !isPathInsidePluginFolder(path)) {
            return {
                kind: "unreadable",
                reason: `"${path}" is not a path inside the plugin folder`,
            };
        }
    }
    const manifest: PluginManifest = {
        name: fields.name ?? folderName,
        script: withoutLeadingDot(fields.script),
        ...(fields.style === undefined ? {} : { style: withoutLeadingDot(fields.style) }),
    };
    return { kind: "manifest", manifest };
}

const MISSING_SCRIPT_REASON: Record<PluginManifestFile, string> = {
    "plugin.json": 'plugin.json names no "script"',
    "index.js": "index.js does not name its script as a string literal; add a plugin.json",
};

const MANIFEST_READERS: Record<
    PluginManifestFile,
    (text: string) => ManifestFields | { readonly reason: string }
> = {
    "plugin.json": readJsonManifest,
    "index.js": scanCamundaIndex,
};

function readJsonManifest(text: string): ManifestFields | { readonly reason: string } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { reason: "plugin.json is not valid JSON" };
    }
    if (typeof parsed !== "object" || parsed === null) {
        return { reason: "plugin.json is not an object" };
    }
    const record = parsed as Record<string, unknown>;
    return {
        name: stringOrUndefined(record.name),
        script: stringOrUndefined(record.script),
        style: stringOrUndefined(record.style),
    };
}

function scanCamundaIndex(text: string): ManifestFields {
    return {
        name: stringProperty(text, "name"),
        script: stringProperty(text, "script"),
        style: stringProperty(text, "style"),
    };
}

/** The value of `key: '…'` when it is a plain string literal. */
function stringProperty(text: string, key: string): string | undefined {
    const match = new RegExp(`\\b${key}\\s*:\\s*(['"])([^'"\\n]*)\\1`).exec(text);
    return match?.[2];
}

function stringOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isPathInsidePluginFolder(path: string): boolean {
    const normalized = path.replaceAll("\\", "/");
    return (
        normalized.length > 0 &&
        !normalized.startsWith("/") &&
        !/^[a-z][a-z0-9+.-]*:/i.test(normalized) &&
        !normalized.split("/").includes("..")
    );
}

function withoutLeadingDot(path: string): string {
    return path.replaceAll("\\", "/").replace(/^(\.\/)+/, "");
}
