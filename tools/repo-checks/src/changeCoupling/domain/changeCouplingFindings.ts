import type { Finding } from "../../fitness/domain/finding";
import type { FindingGroup } from "../../fitness/domain/fitnessFunction";
import type { CoupledPair } from "./changeCoupling";

export const CHANGE_COUPLING_GROUPS: readonly [FindingGroup, ...FindingGroup[]] = [
    { id: "kotlin-only", title: "Hidden, Kotlin only" },
    { id: "across-languages", title: "Hidden, across languages" },
    { id: "across-workspaces", title: "Hidden, across workspaces" },
    { id: "within-workspace", title: "Hidden, within a workspace" },
    { id: "explained", title: "Explained by a shared import", collapsed: true },
];

function code(path: string): string {
    return `\`${path}\``;
}

export function changeCouplingFindings(pairs: readonly CoupledPair[]): Finding[] {
    return pairs.flatMap(
        ({ files, sharedChanges, revisions, degreePercent, coupling, compositionRoots }) => {
            if (coupling.kind === "linked") {
                return [];
            }
            const [left, right] = files;
            const explanation =
                coupling.kind === "explained"
                    ? `; explained by ${code(coupling.by)} (${coupling.coChanges} of ${sharedChanges})`
                    : "";
            const compositionMark =
                compositionRoots.length === 0
                    ? ""
                    : `; composition root: ${compositionRoots.map(code).join(", ")}`;
            return [
                {
                    key: `${left} ↔ ${right}`,
                    path: left,
                    paths: [left, right],
                    pathOrder: "code-unit",
                    line: 1,
                    group: coupling.kind === "explained" ? "explained" : coupling.group,
                    message: `changes with ${code(right)} in ${sharedChanges} PRs (${revisions[0]} and ${revisions[1]} revisions), degree ${degreePercent} %${explanation}${compositionMark}`,
                },
            ];
        },
    );
}
