import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runMissedPartnerCli } from "../../changeCoupling/adapter/in/missedPartnerCli";
import { EngineSourceStructure } from "../../changeCoupling/adapter/out/engineSourceStructure";
import { replayMissedPartnersAtHead } from "../../changeCoupling/service/missedPartnerReplayService";
import { GitCommitHistory } from "../../history/adapter/out/gitCommitHistory";
import { runMutationCli } from "../../mutationScore/adapter/in/mutationCli";
import { MutationRunDirectory } from "../../mutationScore/adapter/out/mutationRunDirectory";
import { StrykerReportFile } from "../../mutationScore/adapter/out/strykerReportFile";
import {
    recordMutationRun,
    summarizeMutationReport,
} from "../../mutationScore/service/mutationRunService";

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

// Yarn runs the script in the workspace dir, so a relative path means one from the repository root.
function callerPath(path: string): string {
    return resolve(REPO_ROOT, path);
}

const OUTPUT = {
    out: (text: string) => process.stdout.write(text),
    error: (text: string) => process.stderr.write(text),
};

function runMutation(args: readonly string[]): number {
    const reports = new StrykerReportFile();
    return runMutationCli(
        args,
        {
            record: ({ outDir, reportPath, ...run }) =>
                recordMutationRun(reports, new MutationRunDirectory(callerPath(outDir)), {
                    ...run,
                    reportPath: callerPath(reportPath),
                }),
            summary: (reportPath) => summarizeMutationReport(reports, callerPath(reportPath)),
        },
        OUTPUT,
    );
}

function runMissedPartner(args: readonly string[]): number {
    const ports = { history: new GitCommitHistory(), sources: new EngineSourceStructure() };
    return runMissedPartnerCli(
        args,
        { replay: () => replayMissedPartnersAtHead(ports, REPO_ROOT) },
        OUTPUT,
    );
}

export function run(args: readonly string[]): number {
    if (args[0] === "mutation") {
        return runMutation(args.slice(1));
    }
    if (args[0] === "missed-partner") {
        return runMissedPartner(args.slice(1));
    }
    const ports = {
        repoRoot: REPO_ROOT,
        history: new GitRepository(REPO_ROOT),
        snapshots: new GitSnapshotBranch(REPO_ROOT),
        checkout: new GitWorktreeCheckout(REPO_ROOT),
    };
    const useCases: FitnessUseCases = {
        report: () => createFitnessReport(FITNESS_FUNCTIONS, BASE_REF, ports),
        recordSnapshots: (outDir) =>
            recordSnapshots(FITNESS_FUNCTIONS, {
                ...ports,
                writer: new SnapshotDirectory(callerPath(outDir)),
            }),
    };
    return runFitnessCli(args, useCases, OUTPUT);
}
