import { DeploymentResult } from "./deployment";

export type RememberedPart = "connection" | "credentials" | "ledgerRow";

export interface NotRemembered {
    readonly part: RememberedPart;
    readonly reason: string;
}

export type DeploymentOutcomeKind = "deployed" | "deployedNotRemembered" | "failed";

export class DeploymentOutcome {
    private constructor(
        private readonly engineResult: DeploymentResult,
        readonly notRemembered: readonly NotRemembered[],
    ) {}

    static fromEngine(result: DeploymentResult): DeploymentOutcome {
        return new DeploymentOutcome(result, []);
    }

    get kind(): DeploymentOutcomeKind {
        return this.engineResult.success ? "deployed" : "failed";
    }

    get succeeded(): boolean {
        return this.engineResult.success;
    }

    get deploymentId(): string | undefined {
        return this.engineResult.deploymentId;
    }

    // Today's rule, as DeploymentService applies it: a failed save fails the deploy.
    notRemembering(_part: RememberedPart, reason: string): DeploymentOutcome {
        return DeploymentOutcome.fromEngine(new DeploymentResult(false, reason));
    }

    toResult(): DeploymentResult {
        return this.engineResult;
    }
}
