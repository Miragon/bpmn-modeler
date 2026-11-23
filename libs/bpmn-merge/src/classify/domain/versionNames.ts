export interface MergeVersions {
    readonly base?: string;
    readonly current: string;
    readonly incoming: string;
}

export type VersionName = keyof MergeVersions;

export const VERSION_NAMES: readonly VersionName[] = ["base", "current", "incoming"];
