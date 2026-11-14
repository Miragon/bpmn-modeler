import { joinWorkspacePath } from "./workspacePath";

export interface PackageManifest {
    readonly name: string;
    readonly version: string;
    /** Node then reaches the package's files only through its `exports`. */
    readonly hasExports: boolean;
    /** As npm writes it: an SPDX expression, or the `type` of a legacy object. */
    readonly license?: string;
}

const MANIFEST_FILE = "package.json";

export function packageManifestOf(text: string): PackageManifest | undefined {
    const manifest = parsedObject(text);
    if (manifest === undefined) {
        return undefined;
    }
    const license = licenseOf(manifest.license);
    return {
        name: stringOrEmpty(manifest.name),
        version: stringOrEmpty(manifest.version),
        hasExports: manifest.exports !== undefined && manifest.exports !== null,
        ...(license !== undefined && { license }),
    };
}

export function manifestPathOf(dir: string): string {
    return joinWorkspacePath(dir, MANIFEST_FILE);
}

function licenseOf(value: unknown): string | undefined {
    const declared = isPlainObject(value) ? value.type : value;
    if (typeof declared !== "string") return undefined;
    const license = declared.trim();
    return license === "" ? undefined : license;
}

function parsedObject(text: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        return isPlainObject(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrEmpty(value: unknown): string {
    return typeof value === "string" ? value : "";
}
