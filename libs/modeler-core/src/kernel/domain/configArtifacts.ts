export interface ConfigArtifact {
    readonly workspaceRoot: string;
    readonly configFolder: string;
    readonly area: string;
    readonly documentPath: string;
    readonly suffix: string;
}

export function configFolderPath(
    _directory: string,
    _configFolder: string,
    ..._entryPath: string[]
): string {
    return "";
}

export function configArtifactPath(_artifact: ConfigArtifact): string {
    return "";
}
