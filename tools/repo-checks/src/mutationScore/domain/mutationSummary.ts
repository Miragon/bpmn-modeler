import type { ContextTally } from "./strykerReport";
import { hasScore, type MutationTally, percent, totalOf } from "./mutationTally";

/** The step summary of a Mutation workflow run: the score per context and every undetected mutant. */
export function mutationSummaryMarkdown(
    workspaceDir: string,
    tallies: ReadonlyMap<string, ContextTally>,
): string {
    const score = (tally: MutationTally) =>
        hasScore(tally) ? percent(tally).replace(" ", "") : "n/a";
    const total = totalOf([...tallies.values()]);
    const survivors = [...tallies.values()].flatMap((tally) => tally.survivors);
    return [
        `## Mutation score of \`${workspaceDir}\` domain rules`,
        "",
        "| Context | Score | Killed | Survived or uncovered |",
        "|---|---:|---:|---:|",
        ...[...tallies].map(
            ([context, tally]) =>
                `| ${context} | ${score(tally)} | ${tally.detected} | ${tally.undetected} |`,
        ),
        `| **Total** | **${score(total)}** | ${total.detected} | ${total.undetected} |`,
        ...(survivors.length === 0
            ? []
            : [
                  "",
                  `<details><summary>${survivors.length} surviving mutants</summary>`,
                  "",
                  ...survivors.map((survivor) => `- \`${survivor}\``),
                  "",
                  "</details>",
              ]),
        "",
    ].join("\n");
}
