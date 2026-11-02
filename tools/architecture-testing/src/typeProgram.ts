import { dirname } from "node:path";
import * as ts from "typescript";

export function readTypeProgram(tsconfigPath: string): ts.Program {
    const { config, error } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(tsconfigPath));
    const errors = error === undefined ? parsed.errors : [error];
    if (errors.length > 0) {
        throw new Error(
            `${tsconfigPath}: ${errors.map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n")).join("; ")}`,
        );
    }
    return ts.createProgram({
        rootNames: parsed.fileNames,
        options: { ...parsed.options, noEmit: true },
    });
}
