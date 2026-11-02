import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { Alias } from "vite";
import type { ViteUserConfig } from "vitest/config";

type CoverageOptions = NonNullable<NonNullable<ViteUserConfig["test"]>["coverage"]>;

const repoRoot = __dirname;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const literalReplacement = (path: string) => path.replace(/\$/g, "$$$$");

const tsconfigPaths = (
    JSON.parse(readFileSync(resolve(repoRoot, "tsconfig.base.json"), "utf8")) as {
        compilerOptions: { paths: Record<string, [string]> };
    }
).compilerOptions.paths;

// Anchored regexes so `@miragon/bpmn-modeler` cannot swallow `@miragon/bpmn-modeler/diff`
// regardless of order, and `x/*` keys keep deep imports such as `…-chooser/types` working.
export const workspaceAliases: Alias[] = Object.entries(tsconfigPaths).map(
    ([specifier, [target]]) =>
        specifier.endsWith("/*")
            ? {
                  find: new RegExp(`^${escapeRegExp(specifier.slice(0, -2))}/(.*)$`),
                  replacement: `${literalReplacement(resolve(repoRoot, target.slice(0, -2)))}/$1`,
              }
            : {
                  find: new RegExp(`^${escapeRegExp(specifier)}$`),
                  replacement: literalReplacement(resolve(repoRoot, target)),
              },
);

export function coveragePreset(
    workspaceDir: string,
    { exclude = [] }: { exclude?: string[] } = {},
): CoverageOptions {
    return {
        provider: "v8",
        reportsDirectory: resolve(repoRoot, "coverage", relative(repoRoot, workspaceDir)),
        reporter: ["text", "html", "json", "json-summary"],
        // Without an explicit include only files a test imports are measured,
        // so a new untested module would not lower the percentage.
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.d.ts", "src/**/__fixtures__/**", ...exclude],
    };
}
