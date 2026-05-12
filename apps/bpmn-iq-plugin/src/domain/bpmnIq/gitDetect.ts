import { execFile } from "child_process";
import { createHash } from "crypto";
import * as path from "path";
import { promisify } from "util";

/**
 * Pure (vscode-free) git detection helpers ported from the upstream
 * `bpmn-iq` agent (`apps/agent/src/git-detect.ts`).
 *
 * The workspace-id derivation MUST stay byte-identical to the agent so
 * peers running the CLI and peers running this extension on the same
 * `(repoId, branch)` pair land in the same daemon-side workspace.
 */

const exec = promisify(execFile);

export interface GitInfo {
    repoId: string;
    repoSlug?: string;
    branch: string;
    gitDir: string;
}

async function git(cwd: string, args: string[]): Promise<string | null> {
    try {
        const { stdout } = await exec("git", args, { cwd, windowsHide: true });
        return stdout.trim();
    } catch {
        return null;
    }
}

export function normalizeRemoteUrl(url: string): string | null {
    let s = url.trim().toLowerCase();
    if (s.startsWith("file://")) return null;
    if (s.endsWith(".git")) s = s.slice(0, -4);
    s = s.replace(/\/+$/, "");

    const ssh = /^git@([^:]+):(.+)$/.exec(s);
    if (ssh) return `${ssh[1]}/${ssh[2]}`;

    const sshProto = /^ssh:\/\/(?:[^@]+@)?([^/]+)\/(.+)$/.exec(s);
    if (sshProto) return `${sshProto[1]}/${sshProto[2]}`;

    const http = /^https?:\/\/(?:[^@]+@)?([^/]+)\/(.+)$/.exec(s);
    if (http) return `${http[1]}/${http[2]}`;

    return s;
}

export function extractRepoSlug(url: string): string | undefined {
    let s = url.trim();
    if (s.endsWith(".git")) s = s.slice(0, -4);
    s = s.replace(/\/+$/, "");

    const ssh = /^git@[^:]+:(.+)$/.exec(s);
    if (ssh) return ssh[1];

    const sshProto = /^ssh:\/\/(?:[^@]+@)?[^/]+\/(.+)$/.exec(s);
    if (sshProto) return sshProto[1];

    const http = /^https?:\/\/(?:[^@]+@)?[^/]+\/(.+)$/.exec(s);
    if (http) return http[1];

    return undefined;
}

// 32 hex chars = 128 bit; collision chance is negligible for the
// (repo × branch) keyspace, and a shorter id keeps URLs/logs readable.
function hash(input: string): string {
    return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function deriveWorkspaceId(repoId: string, branch: string): string {
    return hash(`${repoId}:${branch}`);
}

export async function detectGit(root: string): Promise<GitInfo | null> {
    const branch = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch || branch === "HEAD") return null;

    const gitDirRaw = await git(root, ["rev-parse", "--git-dir"]);
    if (!gitDirRaw) return null;
    const gitDir = path.isAbsolute(gitDirRaw)
        ? gitDirRaw
        : path.resolve(root, gitDirRaw);

    const remote = await git(root, ["config", "--get", "remote.origin.url"]);
    const normalized = remote ? normalizeRemoteUrl(remote) : null;
    const repoId = normalized ? hash(normalized) : hash(path.resolve(root));
    const repoSlug = normalized ? extractRepoSlug(remote!) : undefined;

    return { repoId, repoSlug, branch, gitDir };
}
