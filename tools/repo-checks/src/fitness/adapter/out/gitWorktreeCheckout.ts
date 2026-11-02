import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TreeCheckout } from "../../port/TreeCheckout";
import { git } from "./git";

export class GitWorktreeCheckout implements TreeCheckout {
    constructor(private readonly repoRoot: string) {}

    withTreeAt<T>(commit: string, use: (root: string) => T): T {
        const root = mkdtempSync(join(tmpdir(), "fitness-"));
        // A failed add leaves no worktree; removing one anyway would mask the add's error.
        let added = false;
        try {
            git(this.repoRoot, ["worktree", "add", "--detach", "--quiet", root, commit]);
            added = true;
            return use(root);
        } finally {
            if (added) {
                git(this.repoRoot, ["worktree", "remove", "--force", root]);
            }
            rmSync(root, { recursive: true, force: true });
        }
    }
}
