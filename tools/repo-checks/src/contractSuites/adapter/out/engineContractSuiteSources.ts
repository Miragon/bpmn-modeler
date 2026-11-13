import {
    type DeclarationName,
    findContractSuites,
    readPathAliases,
    readTypeProgram,
    readWorkspaces,
    resolveAliasImport,
} from "@miragon/architecture-testing";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { trackedFiles } from "../../../fitness/adapter/out/git";
import {
    CONTRACT_HELPER_MODULE,
    type ContractSuiteInventory,
    type CoreScope,
    type Declared,
    isAdapterSource,
    isLiteralAdapterSource,
    isPortSource,
    isProgramSource,
    isSpecSource,
    type KitLayout,
} from "../../domain/contractSuites";
import type { ContractSuiteSources } from "../../port/ContractSuiteSources";

export class EngineContractSuiteSources implements ContractSuiteSources {
    readLayout(repoRoot: string): KitLayout {
        const tsconfig = join(repoRoot, "tsconfig.base.json");
        return {
            helperModule: existsSync(tsconfig)
                ? resolveAliasImport(
                      CONTRACT_HELPER_MODULE,
                      readPathAliases(readFileSync(tsconfig, "utf8")),
                      new Set(trackedFiles(repoRoot)),
                  )
                : undefined,
            hexagonalWorkspaceDirs: readWorkspaces(repoRoot)
                .filter(({ kind }) => kind === "hexagonal")
                .map(({ dir }) => dir),
        };
    }

    read(repoRoot: string, scope: CoreScope): ContractSuiteInventory {
        // An import through node_modules resolves to the real path, so a symlinked root loads it twice.
        const root = realpathSync(repoRoot);
        const tracked = new Set(trackedFiles(root));
        const sources = [...tracked].filter((path) => isProgramSource(path, scope));
        const pathOf = (fileName: string): string => relative(root, fileName).split(sep).join("/");
        const trackedPathOf = (fileName: string): string | undefined => {
            const path = pathOf(fileName);
            return tracked.has(path) ? path : undefined;
        };
        const accepts =
            (rule: (path: string) => boolean) =>
            (fileName: string): boolean => {
                const path = trackedPathOf(fileName);
                return path !== undefined && rule(path);
            };
        const suites = findContractSuites(
            readTypeProgram(join(root, "tsconfig.base.json"), {
                files: sources.map((path) => join(root, path)),
                types: [],
            }),
            {
                isPortFile: accepts((path) => isPortSource(path, scope)),
                isAdapterFile: accepts((path) => isAdapterSource(path, scope)),
                isLiteralAdapterFile: accepts((path) => isLiteralAdapterSource(path, scope)),
                isSpecFile: accepts(isSpecSource),
                helperModule: join(root, scope.helperModule),
            },
        );
        const declared = ({ fileName, name }: DeclarationName): Declared => ({
            path: pathOf(fileName),
            name,
        });
        return {
            ports: suites.ports.map((port) => ({ ...declared(port), members: port.members })),
            adapters: suites.adapters.map((adapter) => ({
                ...declared(adapter),
                line: adapter.line,
                ports: adapter.ports.map(declared),
            })),
            helpers: suites.helpers.map((helper) => ({
                ...declared(helper),
                ports: helper.ports.map(declared),
            })),
            specs: suites.specs.map((spec) => ({
                path: pathOf(spec.fileName),
                adapters: spec.adapters.map(declared),
                helpers: spec.helpers.map(declared),
            })),
        };
    }
}
