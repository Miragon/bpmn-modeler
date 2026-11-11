import { Allowance } from "../domain/allowance";
import { CodeApproval } from "../domain/codeApproval";
import {
    CONTENT_ROW_MIGRATION_WAIT_MS,
    contentRowMigrationLogLine,
    contentRowMigrationOf,
    contentRowsToLocate,
} from "../domain/contentRowMigration";
import { PluginApprovalStorePort } from "../port/approvalPorts";
import { LoggerPort } from "../port/hostPorts";
import { AllowanceLocator } from "./AllowanceLocator";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Rewrites the rows pinned to content as allowances, once per host process at start. */
export class ContentRowMigration {
    private running: Promise<void> | undefined;

    constructor(
        private readonly approvals: PluginApprovalStorePort,
        private readonly allowances: AllowanceLocator,
        private readonly logger: LoggerPort,
        private readonly wait: (ms: number) => Promise<void> = delay,
    ) {}

    /** Starts once; a later call returns the same promise. Never rejects. */
    run(): Promise<void> {
        this.running ??= this.migrate();
        return this.running;
    }

    /** Resolves when the run settled, at most CONTENT_ROW_MIGRATION_WAIT_MS after this call; at once when no run started. */
    whenSettled(): Promise<void> {
        return this.running === undefined
            ? Promise.resolve()
            : Promise.race([this.running, this.wait(CONTENT_ROW_MIGRATION_WAIT_MS)]);
    }

    /** Each content row's place located as the allowance of the add-on there now; places not found are left out. */
    locate(rows: readonly CodeApproval[]): ReadonlyMap<string, Allowance> {
        const located = new Map<string, Allowance>();
        for (const { id, kind } of contentRowsToLocate(rows)) {
            const allowance = this.allowances.locatedAllowanceAt(kind, id);
            if (allowance !== undefined) {
                located.set(id, allowance);
            }
        }
        return located;
    }

    private async migrate(): Promise<void> {
        try {
            const rows = await this.approvals.readStored();
            // Synchronous, so no revoke in this process lands between the read and a change that writes the allowance back.
            const change = contentRowMigrationOf(rows, this.locate(rows));
            if (change === undefined) {
                return;
            }
            await this.approvals.change(change);
            this.logger.logInfo(contentRowMigrationLogLine(change.revoke.length));
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.logError(
                new Error(`Approvals: could not rewrite approvals pinned to content: ${reason}`),
            );
        }
    }
}

export type ContentRows = Pick<ContentRowMigration, "whenSettled" | "locate">;
