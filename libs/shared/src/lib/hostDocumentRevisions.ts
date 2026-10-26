export type HostDocumentReceipt = "stale" | "initial" | "update";

/**
 * A webview session's view of the host document: which revision the host last
 * pushed, which one the modeler actually represents, whether the user edited it
 * since, and a version that lets an in-flight export tell whether a host push
 * overtook it.
 */
export class HostDocumentRevisions {
    private latestRevision = 0;
    private importedRevision = 0;
    private acceptedDocuments = 0;
    private editedSinceImport = false;

    receive(revision: number): HostDocumentReceipt {
        if (revision < this.latestRevision) return "stale";
        this.latestRevision = revision;
        this.acceptedDocuments++;
        return this.acceptedDocuments === 1 ? "initial" : "update";
    }

    get version(): number {
        return this.acceptedDocuments;
    }

    isCurrent(versionSnapshot: number): boolean {
        return versionSnapshot === this.acceptedDocuments;
    }

    markEdited(): void {
        this.editedSinceImport = true;
    }

    // An import a newer push overtook must not claim that push's revision, but
    // it still replaced the edited diagram.
    markImported(revision: number): void {
        this.editedSinceImport = false;
        if (revision === this.latestRevision) {
            this.importedRevision = revision;
        }
    }

    /** Whether the modeler was edited since it last imported a host document. */
    get isEditedSinceImport(): boolean {
        return this.editedSinceImport;
    }

    get representedRevision(): number {
        return this.importedRevision;
    }
}
