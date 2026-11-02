import { execFileSync } from "node:child_process";

export function git(repoRoot: string, args: readonly string[]): string {
    return execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
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
