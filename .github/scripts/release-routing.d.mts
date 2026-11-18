export interface ReleaseLine {
    id: string;
    componentPath: string;
    ships: readonly string[];
    /** Checked only against the files the line ships. */
    breaking: readonly string[];
}

export interface ReleaseLineRegistry {
    ignore: readonly string[];
    unreleased: readonly string[];
    lines: readonly ReleaseLine[];
}

export interface AttributionGroup {
    subject: string;
    lines: string[];
}

export interface Attribution {
    source: "derived";
    groups: AttributionGroup[];
}

export interface MergedCommit {
    sha: string;
    title: string;
    files: readonly string[];
}

export interface ExistingAttribution {
    sha: string;
    lines: readonly string[];
}

export interface MissingAttribution {
    sha: string;
    subject: string;
    lines: string[];
}

export function derivedLines(files: readonly string[], registry: ReleaseLineRegistry): string[];
export function resolveAttribution(
    change: { title: string; files: readonly string[] },
    registry: ReleaseLineRegistry,
): Attribution;
export function missingAttributions(
    commits: readonly MergedCommit[],
    existing: readonly ExistingAttribution[],
    registry: ReleaseLineRegistry,
): MissingAttribution[];
