import { dirname } from "node:path";
import * as ts from "typescript";

export interface TypeProgramOptions {
    /** In place of the config's `files` and `include`, so a config without them globs nothing. */
    readonly files?: readonly string[];
    /** `[]` loads no `@types` package the files do not import. */
    readonly types?: readonly string[];
}

export function readTypeProgram(
    tsconfigPath: string,
    { files, types }: TypeProgramOptions = {},
): ts.Program {
    const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const json =
        files === undefined || config === undefined
            ? config
            : { extends: config.extends, compilerOptions: config.compilerOptions, files };
    const parsed = ts.parseJsonConfigFileContent(json, ts.sys, dirname(tsconfigPath));
    const errors = error === undefined ? parsed.errors : [error];
    if (errors.length > 0) {
        throw new Error(
            `${tsconfigPath}: ${errors.map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n")).join("; ")}`,
        );
    }
    return ts.createProgram({
        rootNames: parsed.fileNames,
        options: {
            ...parsed.options,
            noEmit: true,
            ...(types === undefined ? {} : { types: [...types] }),
        },
    });
}
