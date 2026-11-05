import { parseArgs } from "node:util";

import type { MutationRun } from "../../domain/mutationRun";

export interface MutationUseCases {
    record(run: {
        readonly reportPath: string;
        readonly commit: string;
        readonly runId: string;
        readonly outDir: string;
    }): MutationRun;
    summary(reportPath: string): string;
}

export interface MutationCliOutput {
    out(text: string): void;
    error(text: string): void;
}

const MUTATION_USAGE = [
    "usage: fitness mutation record --report <json> --commit <sha> --run <id> --out <dir>",
    "       fitness mutation summary --report <json>",
].join("\n");

const EXIT_OK = 0;
const EXIT_BROKEN_INPUT = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {}

function required(values: Record<string, string | undefined>, name: string): string {
    const value = values[name];
    if (value === undefined || value.trim() === "") {
        throw new UsageError(`needs --${name}`);
    }
    return value;
}

function parseCommand(args: readonly string[]) {
    let parsed;
    try {
        parsed = parseArgs({
            args: [...args],
            options: {
                report: { type: "string" },
                commit: { type: "string" },
                run: { type: "string" },
                out: { type: "string" },
            },
            allowPositionals: true,
        });
    } catch (error) {
        throw new UsageError((error as Error).message);
    }
    const { positionals, values } = parsed;
    const [command, ...extra] = positionals;
    if (extra.length > 0) {
        throw new UsageError(`unexpected argument ${extra[0]}`);
    }
    if (command === "record") {
        return {
            command,
            reportPath: required(values, "report"),
            commit: required(values, "commit"),
            runId: required(values, "run"),
            outDir: required(values, "out"),
        } as const;
    }
    if (command === "summary") {
        const unexpected = (["commit", "run", "out"] as const).find(
            (name) => values[name] !== undefined,
        );
        if (unexpected !== undefined) {
            throw new UsageError(`summary does not take --${unexpected}`);
        }
        return { command, reportPath: required(values, "report") } as const;
    }
    throw new UsageError(
        command === undefined ? "needs record or summary" : `unknown command ${command}`,
    );
}

/** Survivors never fail: a non-zero exit means broken input. */
export function runMutationCli(
    args: readonly string[],
    useCases: MutationUseCases,
    output: MutationCliOutput,
): number {
    try {
        const command = parseCommand(args);
        if (command.command === "summary") {
            output.out(useCases.summary(command.reportPath));
        } else {
            const run = useCases.record(command);
            output.out(`Recorded run ${run.runId} at ${run.commit}\n`);
        }
        return EXIT_OK;
    } catch (error) {
        if (error instanceof UsageError) {
            output.error(`fitness mutation: ${error.message}\n${MUTATION_USAGE}\n`);
            return EXIT_USAGE;
        }
        output.error(`fitness mutation: ${(error as Error).message}\n`);
        return EXIT_BROKEN_INPUT;
    }
}
