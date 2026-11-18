import { execFile } from "node:child_process";
import { devNull } from "node:os";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export interface GitOutcome {
    code: number;
    /** Standard output; with the error output after it when Git failed. */
    output: string;
}

/**
 * Runs Git as a throwaway identity, without the user's config, signing or
 * hooks, and resolves with its exit code: a conflicting merge, rebase,
 * cherry-pick or stash pop exits 1.
 */
export function gitOutcome(repository: string, ...args: string[]): Promise<GitOutcome> {
    return runFile(
        "git",
        [
            "-c",
            "user.name=VS Code smoke",
            "-c",
            "user.email=vscode-smoke@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "init.defaultBranch=main",
            ...args,
        ],
        {
            cwd: repository,
            env: {
                // A caller's GIT_DIR would point every command at another repository.
                ...Object.fromEntries(
                    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
                ),
                GIT_CONFIG_GLOBAL: devNull,
                GIT_CONFIG_NOSYSTEM: "1",
                // A status must not rewrite the index of a repository the window's Git watches.
                GIT_OPTIONAL_LOCKS: "0",
            },
        },
    ).then(
        ({ stdout }) => ({ code: 0, output: stdout }),
        (error: { stdout?: string; stderr?: string; code?: number }) => ({
            code: typeof error.code === "number" ? error.code : 1,
            output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
        }),
    );
}

/** Git's output; rejects with it when Git fails. */
export async function runGit(repository: string, ...args: string[]): Promise<string> {
    const { code, output } = await gitOutcome(repository, ...args);
    if (code !== 0) throw new Error(`git ${args.join(" ")} exited with ${code}: ${output}`);
    return output;
}
