import { existsSync, readFileSync } from "node:fs";

const reportPath = process.argv[2];
if (!reportPath || !existsSync(reportPath)) {
    console.log(`No mutation report at \`${reportPath}\`.`);
    process.exit(0);
}

const DETECTED = new Set(["Killed", "Timeout"]);
const UNDETECTED = new Set(["Survived", "NoCoverage"]);

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const contexts = new Map();

for (const [filePath, file] of Object.entries(report.files)) {
    const context = filePath.match(/src\/(.+?)\/domain\//)?.[1] ?? "other";
    const tally = contexts.get(context) ?? { detected: 0, undetected: 0, survivors: [] };
    for (const mutant of file.mutants) {
        if (DETECTED.has(mutant.status)) tally.detected++;
        if (UNDETECTED.has(mutant.status)) {
            tally.undetected++;
            tally.survivors.push(`${filePath}:${mutant.location.start.line} ${mutant.mutatorName}`);
        }
    }
    contexts.set(context, tally);
}

const score = ({ detected, undetected }) =>
    detected + undetected === 0
        ? "n/a"
        : `${((100 * detected) / (detected + undetected)).toFixed(1)}%`;

const rows = [...contexts.entries()].sort(([a], [b]) => a.localeCompare(b));
const total = rows.reduce(
    (sum, [, tally]) => ({
        detected: sum.detected + tally.detected,
        undetected: sum.undetected + tally.undetected,
    }),
    { detected: 0, undetected: 0 },
);

console.log("## Mutation score of `libs/modeler-core` domain rules\n");
console.log("| Context | Score | Killed | Survived or uncovered |");
console.log("|---|---:|---:|---:|");
for (const [context, tally] of rows) {
    console.log(`| ${context} | ${score(tally)} | ${tally.detected} | ${tally.undetected} |`);
}
console.log(`| **Total** | **${score(total)}** | ${total.detected} | ${total.undetected} |`);

const survivors = rows.flatMap(([, tally]) => tally.survivors);
if (survivors.length > 0) {
    console.log(`\n<details><summary>${survivors.length} surviving mutants</summary>\n`);
    for (const survivor of survivors) console.log(`- \`${survivor}\``);
    console.log("\n</details>");
}
