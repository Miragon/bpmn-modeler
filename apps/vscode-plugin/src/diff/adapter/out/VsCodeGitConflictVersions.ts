import { extensions, Uri } from "vscode";

import type { API, GitExtension, Repository } from "./git";

/** SPIKE stand-in for the core's `ConflictStageFacts`. */
export interface ConflictStages {
    readonly gitAvailable: boolean;
    readonly inMergeChanges: boolean;
    readonly base?: string;
    readonly current?: string;
    readonly incoming?: string;
}

const UNAVAILABLE: ConflictStages = { gitAvailable: false, inMergeChanges: false };

/**
 * Reads the index stages of a conflicted file through the built-in Git extension, found at
 * runtime (no `extensionDependencies`). A stage Git does not have reads as absent.
 */
export class VsCodeGitConflictVersions {
    constructor(private readonly log: (line: string) => void) {}

    async read(fileUri: Uri): Promise<ConflictStages> {
        const api = await this.gitApi();
        if (!api) return UNAVAILABLE;
        const repository = api.getRepository(fileUri);
        if (!repository) {
            this.log(`no repository holds ${fileUri.toString()}`);
            return { gitAvailable: true, inMergeChanges: false };
        }
        await repository.status();
        const inMergeChanges = repository.state.mergeChanges.some(
            (change) => change.uri.fsPath === fileUri.fsPath,
        );
        const [base, current, incoming] = await Promise.all(
            [":1", ":2", ":3"].map((stage) => this.stage(repository, stage, fileUri)),
        );
        return { gitAvailable: true, inMergeChanges, base, current, incoming };
    }

    private async stage(
        repository: Repository,
        stage: string,
        fileUri: Uri,
    ): Promise<string | undefined> {
        try {
            const bytes = await repository.buffer(stage, fileUri.fsPath);
            return Buffer.from(bytes).toString("utf8");
        } catch {
            return undefined;
        }
    }

    private async gitApi(): Promise<API | undefined> {
        const extension = extensions.getExtension<GitExtension>("vscode.git");
        if (!extension) {
            this.log("vscode.git is not installed or disabled");
            return undefined;
        }
        const exports = extension.isActive ? extension.exports : await extension.activate();
        if (!exports.enabled) {
            this.log("vscode.git is not enabled");
            return undefined;
        }
        const api = exports.getAPI(1);
        if (api.state !== "initialized") {
            await new Promise<void>((done) => {
                const subscription = api.onDidChangeState((state) => {
                    if (state !== "initialized") return;
                    subscription.dispose();
                    done();
                });
            });
        }
        return api;
    }
}
