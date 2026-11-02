import { fileURLToPath } from "node:url";

import { type FitnessUseCases, runFitnessCli } from "../adapter/in/cli";
import { GitRepository } from "../adapter/out/gitRepository";
import { GitSnapshotBranch } from "../adapter/out/gitSnapshotBranch";
import { GitWorktreeCheckout } from "../adapter/out/gitWorktreeCheckout";
import { SnapshotDirectory } from "../adapter/out/snapshotDirectory";
import { createFitnessReport } from "../service/fitnessReportService";
import { recordSnapshots } from "../service/snapshotService";
import { FITNESS_FUNCTIONS } from "./fitnessFunctions";

const BASE_REF = "origin/main";

// The checkout that holds this code is the one measured, wherever the command was started.
const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));

export function run(args: readonly string[]): number {
    const ports = {
        repoRoot: REPO_ROOT,
        history: new GitRepository(REPO_ROOT),
        snapshots: new GitSnapshotBranch(REPO_ROOT),
        checkout: new GitWorktreeCheckout(REPO_ROOT),
    };
    const useCases: FitnessUseCases = {
        report: () => createFitnessReport(FITNESS_FUNCTIONS, BASE_REF, ports),
        recordSnapshots: (outDir) =>
            recordSnapshots(FITNESS_FUNCTIONS, { ...ports, writer: new SnapshotDirectory(outDir) }),
    };
    return runFitnessCli(args, useCases, {
        out: (text) => process.stdout.write(text),
        error: (text) => process.stderr.write(text),
    });
}
