export const TEST_FOLDERS: ReadonlySet<string> = new Set([
    "__fixtures__",
    "__tests__",
    "test",
    "tests",
]);
export const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
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
