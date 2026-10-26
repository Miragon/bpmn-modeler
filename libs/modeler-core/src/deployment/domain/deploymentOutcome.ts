import { DeploymentResult } from "./deployment";

export type RememberedPart = "connection" | "credentials" | "ledgerRow";

export interface NotRemembered {
    readonly part: RememberedPart;
    readonly reason: string;
}

export type DeploymentOutcomeKind = "deployed" | "deployedNotRemembered" | "failed";

const PART_LABELS: Record<RememberedPart, string> = {
    connection: "connection settings",
    credentials: "credentials",
    ledgerRow: "deployment status",
};

/**
 * The engine's answer is final: a deploy it accepted stays deployed even when
 * saving its connection, credentials or ledger row afterwards fails, because the
 * deployment is live either way.
 */
export class DeploymentOutcome {
    private constructor(
        private readonly engineResult: DeploymentResult,
        readonly notRemembered: readonly NotRemembered[],
    ) {}

    static fromEngine(result: DeploymentResult): DeploymentOutcome {
        return new DeploymentOutcome(result, []);
    }

    get kind(): DeploymentOutcomeKind {
        if (!this.succeeded) return "failed";
        return this.notRemembered.length === 0 ? "deployed" : "deployedNotRemembered";
    }

    get succeeded(): boolean {
        return this.engineResult.success;
    }

    get deploymentId(): string | undefined {
        return this.engineResult.deploymentId;
    }

    notRemembering(part: RememberedPart, reason: string): DeploymentOutcome {
        if (!this.succeeded) return this;
        return new DeploymentOutcome(this.engineResult, [...this.notRemembered, { part, reason }]);
    }

    toResult(): DeploymentResult {
        if (this.kind !== "deployedNotRemembered") return this.engineResult;
        const unsaved = this.notRemembered
            .map(({ part, reason }) => `${PART_LABELS[part]} (${reason})`)
            .join(", ");
        return new DeploymentResult(
            true,
            `${this.engineResult.message} Not saved: ${unsaved}.`,
            this.deploymentId,
        );
    }
}
