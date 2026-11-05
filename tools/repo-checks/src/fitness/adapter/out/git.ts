import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function git(repoRoot: string, args: readonly string[]): string {
    return execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

/** Bytes, not text: `git cat-file --batch` sizes its objects in bytes. */
export function gitBytes(repoRoot: string, args: readonly string[], input: string): Buffer {
    return execFileSync("git", args, {
        cwd: repoRoot,
        env: { ...process.env, LC_ALL: "C" },
        input,
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
    });
}

export function gitSucceeds(repoRoot: string, args: readonly string[]): boolean {
    try {
        git(repoRoot, args);
        return true;
    } catch {
        return false;
    }
}

export function lines(output: string): string[] {
    return output.split("\n").filter((line) => line !== "");
}

/** The tracked files as they would be at a commit: build output and scratch files stay out, a deleted one too. */
export function trackedFiles(repoRoot: string): string[] {
    return git(repoRoot, ["ls-files", "-z"])
        .split("\0")
        .filter((path) => path !== "" && existsSync(join(repoRoot, path)));
}
