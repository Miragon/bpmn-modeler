export const TEST_FOLDERS: ReadonlySet<string> = new Set([
    "__fixtures__",
    "__tests__",
    "test",
    "tests",
]);
export const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
export const DECLARATION_FILE = /\.d\.[cm]?ts$/;
export const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts)$/;
export const SCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SPEC_OR_SPEC_DATA_FILE = /\.(spec|test)\.[^/]+$/;
const BUILD_CONFIG = /\.config\.[^/]+$/;

/** Wider than `SPEC_FILE`: `*.spec.*` also covers a module only specs read, such as `a.spec.data.ts`. */
export function isSpecOrSpecData(path: string): boolean {
    return SPEC_OR_SPEC_DATA_FILE.test(path);
}

/** `*.config.*` in any language, such as `vite.config.mts` or `eslint.config.cjs`. */
export function isBuildConfig(path: string): boolean {
    return BUILD_CONFIG.test(path);
}

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

/** TypeScript that runs. A test folder counts anywhere in `path`, so a caller that scopes by workspace passes the path inside it. */
export function isTypeScriptSource(path: string): boolean {
    return TYPESCRIPT_FILE.test(path) && !isTestOrDeclarationFile(path);
}
