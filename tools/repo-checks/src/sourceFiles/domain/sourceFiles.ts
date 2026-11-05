export const TEST_FOLDERS: ReadonlySet<string> = new Set([
    "__fixtures__",
    "__tests__",
    "test",
    "tests",
]);
export const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;

const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

function isMeasuredTypeScript(pathInWorkspace: string): boolean {
    const folders = pathInWorkspace.split("/");
    const name = folders.pop() as string;
    return (
        TYPESCRIPT_FILE.test(name) &&
        !DECLARATION_FILE.test(name) &&
        !SPEC_FILE.test(name) &&
        !folders.some((folder) => TEST_FOLDERS.has(folder))
    );
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
