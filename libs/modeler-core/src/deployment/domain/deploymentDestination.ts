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
