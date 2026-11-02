// Vite's runner resolves the extensionless imports and `@miragon/*` aliases that Node's type stripping cannot.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile, runnerImport } from "vite";

const workspaceDir = fileURLToPath(new URL("..", import.meta.url));

const workspaceConfig = await loadConfigFromFile(
    { command: "serve", mode: "production" },
    resolve(workspaceDir, "vitest.config.ts"),
    workspaceDir,
    "silent",
);
const { module } = await runnerImport(resolve(workspaceDir, "src/fitness/composition/main.ts"), {
    root: workspaceDir,
    resolve: { alias: workspaceConfig?.config.resolve?.alias },
    logLevel: "error",
});
process.exitCode = module.run(process.argv.slice(2));
