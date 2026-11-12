import { Allowance, allowanceOf } from "../domain/allowance";
import { AllowanceKind } from "../domain/approvalRowKind";
import { RepositoryFilesPort } from "../port/repositoryFilesPort";
import { RepositoryLocator } from "./RepositoryLocator";

/**
 * Computes an add-on's allowance from disk: its realpath first, so a link
 * never lets a repository cover code elsewhere, then the repository there,
 * then the host. No memo; each caller keeps its own.
 */
export class AllowanceLocator {
    private readonly repositories: RepositoryLocator;

    constructor(
        private readonly files: RepositoryFilesPort,
        private readonly host: string,
    ) {
        this.repositories = new RepositoryLocator(files);
    }

    /** The allowance of the add-on found at `folder` now. */
    allowanceAt(kind: AllowanceKind, folder: string): Allowance {
        return (
            this.locatedAllowanceAt(kind, folder) ??
            allowanceOf(kind, folder, { kind: "noRepository" }, this.host)
        );
    }

    /** `undefined` when nothing is at `folder` here: a row of a place gone here may name one elsewhere. */
    locatedAllowanceAt(kind: AllowanceKind, folder: string): Allowance | undefined {
        const realFolder = this.files.realPath(folder);
        return realFolder === undefined
            ? undefined
            : allowanceOf(kind, realFolder, this.repositories.originOf(realFolder), this.host);
    }
}
