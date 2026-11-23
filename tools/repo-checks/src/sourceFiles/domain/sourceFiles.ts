import { isTestOrDeclarationFile, TYPESCRIPT_FILE } from "@miragon/architecture-testing";

function isMeasuredTypeScript(pathInWorkspace: string): boolean {
    return TYPESCRIPT_FILE.test(pathInWorkspace) && !isTestOrDeclarationFile(pathInWorkspace);
}

/** Every workspace's TypeScript, without specs, declaration files and test folders. */
export function measuredTypeScriptFiles(
    files: readonly string[],
    workspaceDirs: readonly string[],
): string[] {
    return files.filter((path) => {
        const dir = workspaceDirs.find((workspaceDir) => path.startsWith(`${workspaceDir}/`));
        return dir !== undefined && isMeasuredTypeScript(path.slice(dir.length + 1));
    });
}
