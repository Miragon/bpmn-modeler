import { execFile } from "child_process";
import * as path from "path";
import { promisify } from "util";

import {
    type GitInfo,
    extractRepoSlug,
    normalizeRemoteUrl,
    shortHash,
} from "@miragon/bpmn-iq-daemon-client/identity";

const exec = promisify(execFile);

/**
 * Detects the git state of a workspace folder by shelling out to `git`.
 *
 * The IO side of repo identification — pure derivation (URL normalisation,
 * slug extraction, repoId hashing) lives in
 * `@miragon/bpmn-iq-daemon-client` so the algorithm stays byte-identical
 * between the CLI agent and this extension.
 */
export class GitDetector {
    async detect(root: string): Promise<GitInfo | null> {
        const branch = await this.git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
        if (!branch || branch === "HEAD") return null;

        const gitDirRaw = await this.git(root, ["rev-parse", "--git-dir"]);
        if (!gitDirRaw) return null;
        const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(root, gitDirRaw);

        const remote = await this.git(root, ["config", "--get", "remote.origin.url"]);
        const normalized = remote ? normalizeRemoteUrl(remote) : null;
        const repoId = normalized ? shortHash(normalized) : shortHash(path.resolve(root));
        const repoSlug = normalized && remote ? extractRepoSlug(remote) : undefined;

        return { repoId, repoSlug, branch, gitDir };
    }

    private async git(cwd: string, args: string[]): Promise<string | null> {
        try {
            const { stdout } = await exec("git", args, { cwd, windowsHide: true });
            return stdout.trim();
        } catch {
            return null;
        }
    }
}
