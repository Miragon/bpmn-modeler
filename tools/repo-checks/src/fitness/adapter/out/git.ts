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

const NEWLINE = 0x0a;

/**
 * The text of each blob, in order, from one `git cat-file --batch`: a `git show` per blob would
 * spawn hundreds of processes. Read as bytes, since each object's size is given in bytes.
 */
export function readBlobs(repoRoot: string, objectNames: readonly string[]): string[] {
    if (objectNames.length === 0) {
        return [];
    }
    const output = execFileSync("git", ["cat-file", "--batch"], {
        cwd: repoRoot,
        env: { ...process.env, LC_ALL: "C" },
        input: objectNames.map((name) => `${name}\n`).join(""),
        maxBuffer: 1024 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
    });
    const contents: string[] = [];
    let offset = 0;
    for (const name of objectNames) {
        const headerEnd = output.indexOf(NEWLINE, offset);
        const header = output.toString("utf8", offset, headerEnd);
        const [, type, size] = header.split(" ");
        if (type !== "blob") {
            throw new Error(`git cat-file read no blob for ${name}: ${header}`);
        }
        const contentStart = headerEnd + 1;
        const contentEnd = contentStart + Number(size);
        contents.push(output.toString("utf8", contentStart, contentEnd));
        offset = contentEnd + 1;
    }
    return contents;
}

/** The file names in `dir` on `ref`, or none when the ref was never fetched. */
export function listBranchFiles(repoRoot: string, ref: string, dir: string): string[] {
    if (!gitSucceeds(repoRoot, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])) {
        return [];
    }
    return lines(git(repoRoot, ["ls-tree", "--name-only", ref, `${dir}/`]));
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
