import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export class TempGitRepository {
    readonly root = mkdtempSync(join(tmpdir(), "fitness-spec-"));

    constructor() {
        this.git("init", "--quiet", "--initial-branch=main");
    }

    git(...args: string[]): string {
        return execFileSync(
            "git",
            [
                "-c",
                "user.name=spec",
                "-c",
                "user.email=spec@example.com",
                "-c",
                "commit.gpgsign=false",
                ...args,
            ],
            { cwd: this.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ).trim();
    }

    write(path: string, content: string): void {
        const file = join(this.root, path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
    }

    commit(path: string, content: string): string {
        this.write(path, content);
        this.git("add", "--all");
        this.git("commit", "--quiet", "-m", `change ${path}`);
        return this.git("rev-parse", "HEAD");
    }

    /** Builds a branch without touching the working tree, as the CI job does through the API. */
    publishDataBranch(ref: string, files: Readonly<Record<string, string>>): void {
        const entries = Object.entries(files).map(([path, content]) => {
            const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
                cwd: this.root,
                input: content,
                encoding: "utf8",
            }).trim();
            return { path, blob };
        });
        const indexFile = join(this.root, ".git", "spec-index");
        const env = { ...process.env, GIT_INDEX_FILE: indexFile };
        for (const { path, blob } of entries) {
            execFileSync(
                "git",
                ["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`],
                {
                    cwd: this.root,
                    env,
                },
            );
        }
        const tree = execFileSync("git", ["write-tree"], {
            cwd: this.root,
            env,
            encoding: "utf8",
        }).trim();
        rmSync(indexFile, { force: true });
        const commit = this.git("commit-tree", tree, "-m", "snapshots");
        this.git("update-ref", ref, commit);
    }

    remove(): void {
        rmSync(this.root, { recursive: true, force: true });
    }
}
