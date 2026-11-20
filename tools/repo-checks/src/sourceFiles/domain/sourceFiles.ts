export const TEST_FOLDERS: ReadonlySet<string> = new Set([
    "__fixtures__",
    "__tests__",
    "test",
    "tests",
]);
export const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;

export const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts)$/;
export const DECLARATION_FILE = /\.d\.[cm]?ts$/;

/** A spec, a file in a test folder or a declaration file: tests, their inputs and typings, none of them code that runs. */
export function isTestOrDeclarationFile(path: string): boolean {
    const folders = path.split("/");
    const name = folders.pop() as string;
    return (
        SPEC_FILE.test(name) ||
        DECLARATION_FILE.test(name) ||
        folders.some((folder) => TEST_FOLDERS.has(folder))
    );
}

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
