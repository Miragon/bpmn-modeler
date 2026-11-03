import { git } from "../../../fitness/adapter/out/git";
import type { CommitRecord, FileChange } from "../../domain/commitHistory";
import type { CommitHistory } from "../../port/CommitHistory";

const RECORD_START = "\x01";

// Pinned so the user's git config (`diff.renames`, `diff.renameLimit`, `log.showSignature`)
// cannot change which renames are followed or what the output holds.
const LOG_ARGS = [
    "log",
    "--first-parent",
    "--diff-merges=first-parent",
    "-M",
    "-l0",
    "--name-status",
    "-z",
    "--no-ext-diff",
    "--no-show-signature",
    `--format=${RECORD_START}%H%x00%s%x00`,
];

export class GitCommitHistory implements CommitHistory {
    firstParentCommits(repoRoot: string, commit: string, depth: number): readonly CommitRecord[] {
        const records = git(repoRoot, [...LOG_ARGS, `--max-count=${depth}`, commit, "--"])
            .split(RECORD_START)
            .slice(1)
            .map(parseRecord);
        if (
            records.length < depth &&
            git(repoRoot, ["rev-parse", "--is-shallow-repository"]).trim() === "true"
        ) {
            throw new Error(
                `this shallow clone holds ${records.length} of the ${depth} first-parent commits needed; run git fetch --unshallow`,
            );
        }
        return records;
    }
}

function parseRecord(record: string): CommitRecord {
    const [commit, subject, ...fields] = record.split("\0");
    const tokens = fields.map((field) => field.replace(/^\n/, "")).filter((field) => field !== "");
    const changes: FileChange[] = [];
    for (let index = 0; index < tokens.length; ) {
        const status = tokens[index];
        if (status.startsWith("R")) {
            changes.push({ kind: "renamed", previousPath: tokens[index + 1], path: tokens[index + 2] });
            index += 3;
        } else {
            changes.push({ kind: kindOf(status), path: tokens[index + 1] });
            index += 2;
        }
    }
    return { commit, subject, changes };
}

function kindOf(status: string): "added" | "modified" | "deleted" {
    if (status === "A") {
        return "added";
    }
    return status === "D" ? "deleted" : "modified";
}
