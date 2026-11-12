import { posix } from "path";

/** What laying out git files needs: the in-memory tree has it, and so can a disk adapter. */
export interface GitLayoutFiles {
    writeFile(path: string, content: string): void;
    createDirectory(path: string): void;
}

export function writeRepository(files: GitLayoutFiles, worktreeRoot: string): void {
    files.createDirectory(`${worktreeRoot}/.git/objects`);
}

/** As `git worktree add` lays it out, with absolute paths or, as `--relative-paths`, relative ones. */
export function writeLinkedWorktree(
    files: GitLayoutFiles,
    repository: string,
    worktree: string,
    { paths = "absolute" }: { readonly paths?: "absolute" | "relative" } = {},
): void {
    const dotGit = `${worktree}/.git`;
    const adminDir = `${repository}/.git/worktrees/${posix.basename(worktree)}`;
    const pathFrom = (from: string, to: string) =>
        paths === "absolute" ? to : posix.relative(from, to);
    files.writeFile(dotGit, `gitdir: ${pathFrom(worktree, adminDir)}\n`);
    files.writeFile(`${adminDir}/commondir`, "../..\n");
    files.writeFile(`${adminDir}/gitdir`, `${pathFrom(adminDir, dotGit)}\n`);
}
