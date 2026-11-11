import {
    backPointerPathOf,
    CodeOrigin,
    dotGitCandidatesOf,
    dotGitReadingOf,
    LinkedWorktreeClaim,
    linkedWorktreeFilesOf,
    linkedWorktreeOriginOf,
} from "../domain/repositoryIdentity";
import { RepositoryFilesPort } from "../port/repositoryFilesPort";

/** Reads the git files that tell which repository holds a folder; `repositoryIdentity` decides. */
export class RepositoryLocator {
    constructor(private readonly files: RepositoryFilesPort) {}

    /** `realFolder` must be a realpath, so every folder above it is one too. */
    originOf(realFolder: string): CodeOrigin {
        for (const candidate of dotGitCandidatesOf(realFolder)) {
            const kind = this.files.entryKindOf(candidate.dotGit);
            if (kind === undefined) {
                continue;
            }
            const text = kind === "file" ? this.files.readTextFile(candidate.dotGit) : undefined;
            const reading = dotGitReadingOf(candidate, kind, text);
            return reading.kind === "linkedWorktreeClaim" ? this.confirmed(reading) : reading;
        }
        return { kind: "noRepository" };
    }

    private confirmed(claim: LinkedWorktreeClaim): CodeOrigin {
        const adminFiles = linkedWorktreeFilesOf(claim.adminDir);
        const gitdirText = this.files.readTextFile(adminFiles.gitdir);
        return linkedWorktreeOriginOf({
            claim,
            adminDirRealPath: this.files.realPath(claim.adminDir),
            commondirText: this.files.readTextFile(adminFiles.commondir),
            backPointerRealPath:
                gitdirText === undefined
                    ? undefined
                    : this.files.realPath(backPointerPathOf(claim.adminDir, gitdirText)),
        });
    }
}
