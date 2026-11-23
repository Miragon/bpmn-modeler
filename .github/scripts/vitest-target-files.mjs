// Which files check-vitest-targets.mjs scans and which of them are specs, apart
// so a spec can pin them to the file kinds of @miragon/architecture-testing:
// the script runs on import.
export const SCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
export const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
