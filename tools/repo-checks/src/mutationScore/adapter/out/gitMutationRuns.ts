import { git, lines, listBranchFiles, readBlobs } from "../../../fitness/adapter/out/git";
import { FITNESS_HISTORY_REF } from "../../../fitness/adapter/out/gitSnapshotBranch";
import { type MutationRun, mutationRunPath, parseMutationRun } from "../../domain/mutationRun";
import type { MutationRuns } from "../../port/MutationRuns";

const RUN_FILE = /^mutation\/(.+)\.json$/;

/** Reads the data branch as last fetched; never touches the network. */
export class GitMutationRuns implements MutationRuns {
    constructor(private readonly ref = FITNESS_HISTORY_REF) {}

    storedRuns(repoRoot: string): readonly MutationRun[] {
        const runIds = listBranchFiles(repoRoot, this.ref, "mutation").flatMap((path) => {
            const runId = RUN_FILE.exec(path)?.[1];
            return runId === undefined ? [] : [runId];
        });
        const texts = readBlobs(
            repoRoot,
            runIds.map((runId) => `${this.ref}:${mutationRunPath(runId)}`),
        );
        return runIds.map((runId, index) => parseMutationRun(runId, texts[index]));
    }

    firstParentChain(repoRoot: string, commit: string): readonly string[] {
        return lines(git(repoRoot, ["rev-list", "--first-parent", commit]));
    }
}
