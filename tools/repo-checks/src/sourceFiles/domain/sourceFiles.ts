import { isTypeScriptSource } from "@miragon/architecture-testing";

/** Every workspace's TypeScript, without specs, declaration files and test folders. */
export function measuredTypeScriptFiles(
    files: readonly string[],
    workspaceDirs: readonly string[],
): string[] {
    return files.filter((path) => {
        const dir = workspaceDirs.find((workspaceDir) => path.startsWith(`${workspaceDir}/`));
        return dir !== undefined && isTypeScriptSource(path.slice(dir.length + 1));
    });
}
