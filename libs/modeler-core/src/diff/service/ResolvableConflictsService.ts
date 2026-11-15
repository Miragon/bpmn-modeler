import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { conflictReadingOf, isMergeViewCandidate } from "../domain/conflictReading";
import { ConflictVersionsSource } from "../port/ConflictVersionsSource";
import { MergeCommandAvailability } from "../port/MergeCommandAvailability";

/**
 * Keeps the host's list of files the merge view opens: every file in Merge
 * Changes whose conflict reads as resolvable. Reads a file's stages once
 * while it stays conflicted and never a file the merge view does not open.
 */
export class ResolvableConflictsService {
    private conflicted: readonly string[] = [];
    private readonly resolvable = new Map<string, boolean>();
    private readonly reading = new Set<string>();
    private told: string | undefined;

    constructor(
        private readonly source: ConflictVersionsSource,
        private readonly availability: MergeCommandAvailability,
        private readonly logger: LoggerPort,
    ) {}

    start(): EditorSubscription {
        return this.source.watchMergeChanges((fileUris) => this.mergeChangesChanged(fileUris));
    }

    private mergeChangesChanged(fileUris: readonly string[]): void {
        this.conflicted = fileUris.filter((fileUri) =>
            isMergeViewCandidate(uriDisplayName(fileUri)),
        );
        for (const fileUri of [...this.resolvable.keys()]) {
            if (!this.conflicted.includes(fileUri)) this.resolvable.delete(fileUri);
        }
        this.conflicted
            .filter((fileUri) => !this.resolvable.has(fileUri) && !this.reading.has(fileUri))
            .forEach((fileUri) => void this.read(fileUri));
        this.tell();
    }

    private async read(fileUri: string): Promise<void> {
        this.reading.add(fileUri);
        try {
            const facts = await this.source.readConflict(fileUri);
            if (this.conflicted.includes(fileUri)) {
                const reading = conflictReadingOf(uriDisplayName(fileUri), facts);
                this.resolvable.set(fileUri, reading.kind === "resolvable");
            }
        } catch (error) {
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
        } finally {
            this.reading.delete(fileUri);
        }
        this.tell();
    }

    private tell(): void {
        const fileUris = this.conflicted.filter((fileUri) => this.resolvable.get(fileUri));
        const list = JSON.stringify(fileUris);
        if (list === this.told) return;
        this.told = list;
        this.availability.setResolvable(fileUris);
    }
}
