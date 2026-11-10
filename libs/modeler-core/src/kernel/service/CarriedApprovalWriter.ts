import {
    allowing,
    ApprovableArtifact,
    ApprovableCodeTexts,
    CarriedApproval,
    carriedApprovals,
    CodeApproval,
    declineKeyOf,
    orphanedCarries,
    revoking,
} from "../domain/codeApproval";
import { PluginApprovalStorePort } from "../port/approvalPorts";
import { LoggerPort } from "../port/hostPorts";

/**
 * Stores a row at each place whose code runs only because the user allowed
 * the same content at another place, so the add-ons view, Revoke and Forget
 * stay per folder and the approval outlives the folder it was given in.
 * One instance per owner of approvable code.
 */
export class CarriedApprovalWriter {
    /** By `declineKeyOf`, so a write in flight is not started twice. */
    private readonly inFlight = new Set<string>();
    /** By `declineKeyOf`: not tried again this session, and logged once. */
    private readonly failed = new Set<string>();
    /**
     * One write at a time: a write's post-write check counts any other row of
     * the content as a source, so a concurrent write's fresh row would keep it
     * alive after a revoke of the real source.
     */
    private writes: Promise<void> = Promise.resolve();

    constructor(
        private readonly store: PluginApprovalStorePort,
        private readonly logger: LoggerPort,
        private readonly texts: Pick<ApprovableCodeTexts, "carriedOver">,
    ) {}

    /** Never rejects: the rule already lets the code run, a missing row only loses per-folder bookkeeping. */
    record(found: readonly ApprovableArtifact[]): Promise<void> {
        const candidates = this.candidatesOf(found, this.store.read());
        if (candidates.length === 0) {
            return Promise.resolve();
        }
        const keys = candidates.map(({ artifact }) => declineKeyOf(artifact));
        keys.forEach((key) => this.inFlight.add(key));
        const written = this.writes.then(() =>
            this.write(candidates.map(({ artifact }) => artifact)),
        );
        this.writes = written.catch(() => undefined);
        return written.then(
            () => keys.forEach((key) => this.inFlight.delete(key)),
            (error: unknown) => {
                keys.forEach((key) => {
                    this.inFlight.delete(key);
                    this.failed.add(key);
                });
                this.logFailure(candidates, error);
            },
        );
    }

    private candidatesOf(
        found: readonly ApprovableArtifact[],
        approvals: readonly CodeApproval[],
    ): CarriedApproval[] {
        return carriedApprovals(found, approvals).filter(({ artifact }) => {
            const key = declineKeyOf(artifact);
            return !this.inFlight.has(key) && !this.failed.has(key);
        });
    }

    private async write(candidates: readonly ApprovableArtifact[]): Promise<void> {
        // A mirror can lag the host, which may already hold the row or no longer the source.
        const carried = carriedApprovals(candidates, await this.store.readStored());
        if (carried.length === 0) return;
        const artifacts = carried.map(({ artifact }) => artifact);
        await this.store.change(allowing(artifacts));
        // A revoke of the content that landed before this write left no source behind.
        const orphaned = new Set(orphanedCarries(artifacts, this.store.read()));
        if (orphaned.size > 0) {
            await this.store.change(revoking([...orphaned]));
        }
        carried
            .filter(({ artifact }) => !orphaned.has(artifact.id))
            .forEach((each) => this.logger.logInfo(this.texts.carriedOver(each)));
    }

    private logFailure(candidates: readonly CarriedApproval[], error: unknown): void {
        const places = candidates.map(({ artifact }) => artifact.id).join(", ");
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.logError(
            new Error(
                `Could not record the approval of ${places}, allowed through the same content elsewhere: ${reason}`,
            ),
        );
    }
}
