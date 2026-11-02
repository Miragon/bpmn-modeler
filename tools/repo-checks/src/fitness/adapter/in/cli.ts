import { parseArgs } from "node:util";

import { jsonReport } from "../../domain/jsonReport";
import { markdownReport } from "../../domain/markdownReport";
import type { FitnessReport } from "../../domain/report";
import type { Snapshot } from "../../domain/snapshot";

export interface FitnessUseCases {
    report(): FitnessReport;
    recordSnapshots(outDir: string): readonly Snapshot[];
}

export interface CliOutput {
    out(text: string): void;
    error(text: string): void;
}

const USAGE = [
    "usage: fitness [report] [--format markdown|json]",
    "       fitness snapshot --out <dir>",
].join("\n");

const EXIT_OK = 0;
const EXIT_BROKEN_INPUT = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {}

function parseCommand(args: readonly string[]) {
    let parsed;
    try {
        parsed = parseArgs({
            args: [...args],
            options: { format: { type: "string" }, out: { type: "string" } },
            allowPositionals: true,
        });
    } catch (error) {
        throw new UsageError((error as Error).message);
    }
    const { positionals, values } = parsed;
    const [command = "report", ...extra] = positionals;
    if (extra.length > 0) {
        throw new UsageError(`unexpected argument ${extra[0]}`);
    }
    if (command === "report") {
        const format = values.format ?? "markdown";
        if (format !== "markdown" && format !== "json") {
            throw new UsageError(`unknown format ${format}`);
        }
        return { command, format } as const;
    }
    if (command === "snapshot") {
        if (values.out === undefined) {
            throw new UsageError("snapshot needs --out <dir>");
        }
        return { command, outDir: values.out } as const;
    }
    throw new UsageError(`unknown command ${command}`);
}

/** Findings never fail: a non-zero exit means broken input or a broken fitness function. */
export function runFitnessCli(
    args: readonly string[],
    useCases: FitnessUseCases,
    output: CliOutput,
): number {
    try {
        const command = parseCommand(args);
        if (command.command === "report") {
            const report = useCases.report();
            output.out(command.format === "json" ? jsonReport(report) : markdownReport(report));
        } else {
            const written = useCases.recordSnapshots(command.outDir);
            output.out(
                written.length === 0
                    ? "Every snapshot is up to date.\n"
                    : written.map(({ commit }) => `Measured ${commit}\n`).join(""),
            );
        }
        return EXIT_OK;
    } catch (error) {
        if (error instanceof UsageError) {
            output.error(`fitness: ${error.message}\n${USAGE}\n`);
            return EXIT_USAGE;
        }
        output.error(`fitness: ${(error as Error).message}\n`);
        return EXIT_BROKEN_INPUT;
    }
}
