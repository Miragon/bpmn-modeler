type Status = "Killed" | "Timeout" | "Survived" | "NoCoverage" | "Ignored" | "CompileError";

function mutant(status: Status, line: number) {
    return { status, mutatorName: "ConditionalExpression", location: { start: { line } } };
}

/** A Stryker JSON report with one mutant per status, on lines 1, 2, … of its file. */
export function strykerReport(files: Record<string, Status[]>) {
    return {
        schemaVersion: "1.0",
        files: Object.fromEntries(
            Object.entries(files).map(([path, statuses]) => [
                path,
                { mutants: statuses.map((status, index) => mutant(status, index + 1)) },
            ]),
        ),
    };
}
