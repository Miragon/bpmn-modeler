import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as ts from "typescript";

// Only the references are read, so the sources a config includes are not listed.
const OPTIONS_ONLY_HOST: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    readDirectory: () => [],
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
};

const DOM_LIB_FILE = /(^|[\\/])lib\.dom(\.[a-z]+)*\.d\.ts$/i;

/**
 * Whether the compiler loads a DOM lib file into the program of a workspace's
 * `tsconfig.json` or of a config it references. The program answers for every way
 * in: the lib, TypeScript's default lib, and a `/// <reference lib="dom" />` in any
 * declaration it loads, such as preact's JSX types. A workspace without a tsconfig,
 * or one the compiler refuses or cannot read, has no compile that proves it DOM-free.
 */
export function compilesWithDom(workspaceDir: string): boolean {
    const rootConfig = join(workspaceDir, "tsconfig.json");
    if (!ts.sys.fileExists(rootConfig)) {
        return true;
    }
    return configsFrom(rootConfig).some((config) => {
        const files = programFiles(config);
        return files === undefined || files.some((file) => DOM_LIB_FILE.test(file));
    });
}

function configsFrom(rootConfig: string): string[] {
    const configs = [rootConfig];
    for (let index = 0; index < configs.length; index++) {
        for (const reference of parseConfig(configs[index]).projectReferences ?? []) {
            const referenced = ts.resolveProjectReferencePath(reference);
            if (!configs.includes(referenced)) {
                configs.push(referenced);
            }
        }
    }
    return configs;
}

function parseConfig(configPath: string): ts.ParsedCommandLine {
    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    return ts.parseJsonConfigFileContent(
        config,
        OPTIONS_ONLY_HOST,
        dirname(configPath),
        undefined,
        configPath,
    );
}

/**
 * The files of a config's program, unset when the compiler refuses the config or does
 * not run. The native compiler, as each workspace's `build` runs it: TypeScript 6 adds
 * the JSX runtime's types, and with them preact's DOM reference, to every program.
 */
function programFiles(configPath: string): string[] | undefined {
    const { status, stdout } = spawnSync(
        process.execPath,
        [nativeCompiler(), "--listFilesOnly", "-p", configPath],
        { encoding: "utf8" },
    );
    return status === 0 ? stdout.split(/\r?\n/).filter((line) => line !== "") : undefined;
}

function nativeCompiler(): string {
    const load = createRequire(__filename);
    const manifestPath = load.resolve("@typescript/native/package.json");
    const { bin } = load(manifestPath) as { bin: { tsc: string } };
    return join(dirname(manifestPath), bin.tsc);
}
