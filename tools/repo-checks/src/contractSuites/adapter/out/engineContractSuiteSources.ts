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
    type Declared,
    isPortSource,
    isProductionSource,
    isSpecSource,
} from "../../domain/contractSuites";
import type { ContractSuiteSources } from "../../port/ContractSuiteSources";

const TYPESCRIPT_SOURCE = /\.[mc]?tsx?$/;
const DECLARATION_FILE = /\.d\.[mc]?ts$/;

export class EngineContractSuiteSources implements ContractSuiteSources {
    read(repoRoot: string): ContractSuiteInventory | undefined {
        // One spelling for every path: under a symlinked temp dir the compiler would load a file twice.
        const root = realpathSync(repoRoot);
        const tsconfig = join(root, "tsconfig.base.json");
        if (!existsSync(tsconfig)) {
            return undefined;
        }
        const tracked = trackedFiles(root);
        const helperModule = resolveAliasImport(
            CONTRACT_HELPER_MODULE,
            readPathAliases(readFileSync(tsconfig, "utf8")),
            new Set(tracked),
        );
        const sourceRoots = readWorkspaces(root)
            .filter(({ kind }) => kind === "hexagonal")
            .map(({ dir }) => `${dir}/src/`);
        const coreSourceRoot = sourceRoots.find((sourceRoot) => helperModule?.startsWith(sourceRoot));
        if (helperModule === undefined || coreSourceRoot === undefined) {
            return undefined;
        }
        const sources = new Set(
            tracked.filter(
                (path) =>
                    TYPESCRIPT_SOURCE.test(path) &&
                    !DECLARATION_FILE.test(path) &&
                    sourceRoots.some((sourceRoot) => path.startsWith(sourceRoot)),
            ),
        );
        const pathOf = (fileName: string): string => relative(root, fileName).split(sep).join("/");
        const sourcePath = (fileName: string): string | undefined => {
            const path = pathOf(fileName);
            return sources.has(path) ? path : undefined;
        };
        const suites = findContractSuites(
            readTypeProgram(tsconfig, {
                files: [...sources].map((path) => join(root, path)),
                types: [],
            }),
            {
                isPortFile: (fileName) => {
                    const path = sourcePath(fileName);
                    return path !== undefined && isPortSource(path, coreSourceRoot);
                },
                isAdapterFile: (fileName) => {
                    const path = sourcePath(fileName);
                    return path !== undefined && isProductionSource(path);
                },
                isSpecFile: (fileName) => {
                    const path = sourcePath(fileName);
                    return path !== undefined && isSpecSource(path);
                },
                helperModule: join(root, helperModule),
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
