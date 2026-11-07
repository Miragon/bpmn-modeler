import { parseArgs } from "node:util";

import { changesReport } from "../../domain/changesReport";
import { jsonReport } from "../../domain/jsonReport";
import { markdownReport } from "../../domain/markdownReport";
import type { FitnessReport } from "../../domain/report";
import type { Snapshot } from "../../domain/snapshot";

export interface ReportRequest {
    /** The report compares with `git merge-base HEAD <baseRef>`. */
    readonly baseRef: string;
    /** A checkout of this repository; the one that holds the code when left out. */
    readonly repo?: string;
}

export interface FitnessUseCases {
    report(request: ReportRequest): FitnessReport;
    recordSnapshots(outDir: string): readonly Snapshot[];
}

export interface CliOutput {
    out(text: string): void;
    error(text: string): void;
    writeFile(path: string, text: string): void;
}

const DEFAULT_BASE_REF = "origin/main";

const USAGE = [
    "usage: fitness [report] [--format markdown|json] [--base <rev>] [--repo <dir>]",
    "       fitness [report] --changes-only [--head-label <text>]",
    "               [--capped-out <file> --max-characters <n>] [--base <rev>] [--repo <dir>]",
    "       fitness snapshot --out <dir>",
    "       fitness mutation record|summary ...",
    "       fitness missed-partner replay",
].join("\n");

const EXIT_OK = 0;
const EXIT_BROKEN_INPUT = 1;
const EXIT_USAGE = 2;

class UsageError extends Error {}

interface ChangesOptions {
    readonly headLabel?: string;
    readonly capped?: { readonly path: string; readonly maxCharacters: number };
}

const POSITIVE_INTEGER = /^[1-9]\d*$/;

function parseChangesOptions(
    values: {
        readonly "changes-only"?: boolean;
        readonly "head-label"?: string;
        readonly "capped-out"?: string;
        readonly "max-characters"?: string;
    },
    format: "markdown" | "json",
): ChangesOptions | undefined {
    const headLabel = values["head-label"];
    const cappedOut = values["capped-out"];
    const maxCharacters = values["max-characters"];
    if (values["changes-only"] !== true) {
        if (headLabel !== undefined) {
            throw new UsageError("--head-label needs --changes-only");
        }
        if (cappedOut !== undefined || maxCharacters !== undefined) {
            throw new UsageError("--capped-out needs --changes-only");
        }
        return undefined;
    }
    if (format === "json") {
        throw new UsageError("--changes-only prints Markdown only");
    }
    if (headLabel === "") {
        throw new UsageError("--head-label needs a text");
    }
    if ((cappedOut === undefined) !== (maxCharacters === undefined)) {
        throw new UsageError("--capped-out and --max-characters go together");
    }
    if (cappedOut === "") {
        throw new UsageError("--capped-out needs a file");
    }
    if (maxCharacters !== undefined && !POSITIVE_INTEGER.test(maxCharacters)) {
        throw new UsageError("--max-characters needs a positive integer");
    }
    return {
        ...(headLabel === undefined ? {} : { headLabel }),
        ...(cappedOut === undefined || maxCharacters === undefined
            ? {}
            : { capped: { path: cappedOut, maxCharacters: Number(maxCharacters) } }),
    };
}

function parseCommand(args: readonly string[]) {
    let parsed;
    try {
        parsed = parseArgs({
            args: [...args],
            options: {
                "format": { type: "string" },
                "out": { type: "string" },
                "base": { type: "string" },
                "repo": { type: "string" },
                "changes-only": { type: "boolean" },
                "head-label": { type: "string" },
                "capped-out": { type: "string" },
                "max-characters": { type: "string" },
            },
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
        if (values.out !== undefined) {
            throw new UsageError("report does not take --out");
        }
        const format = values.format ?? "markdown";
        if (format !== "markdown" && format !== "json") {
            throw new UsageError(`unknown format ${format}`);
        }
        if (values.base === "") {
            throw new UsageError("--base needs a revision");
        }
        if (values.repo === "") {
            throw new UsageError("--repo needs a directory");
        }
        const request: ReportRequest = {
            baseRef: values.base ?? DEFAULT_BASE_REF,
            ...(values.repo === undefined ? {} : { repo: values.repo }),
        };
        return { command, format, request, changes: parseChangesOptions(values, format) } as const;
    }
    if (command === "snapshot") {
        for (const option of [
            "format",
            "base",
            "repo",
            "changes-only",
            "head-label",
            "capped-out",
            "max-characters",
        ] as const) {
            if (values[option] !== undefined) {
                throw new UsageError(`snapshot does not take --${option}`);
            }
        }
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
            const report = useCases.report(command.request);
            const { changes } = command;
            if (changes === undefined) {
                output.out(command.format === "json" ? jsonReport(report) : markdownReport(report));
            } else {
                output.out(changesReport(report, { headLabel: changes.headLabel }));
                if (changes.capped !== undefined) {
                    output.writeFile(
                        changes.capped.path,
                        changesReport(report, {
                            headLabel: changes.headLabel,
                            maxCharacters: changes.capped.maxCharacters,
                        }),
                    );
                }
            }
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
