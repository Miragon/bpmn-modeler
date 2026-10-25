export type HostDocumentReceipt = "stale" | "initial" | "update";

/**
 * A webview session's view of the host document: which revision the host last
 * pushed, which one the modeler actually represents, and a version that lets
 * an in-flight export tell whether a host push overtook it.
 */
export class HostDocumentRevisions {
    private latestRevision = 0;
    private importedRevision = 0;
    private acceptedDocuments = 0;

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

    // An import a newer push overtook must not claim that push's revision.
    markImported(revision: number): void {
        if (revision === this.latestRevision) {
            this.importedRevision = revision;
        }
    }

    get representedRevision(): number {
        return this.importedRevision;
    }
}
