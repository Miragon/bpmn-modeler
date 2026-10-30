import { StatusView } from "../../kernel/domain/statusView";
import { DeploymentFreshness } from "./deploymentLedger";

/** The connection the deployment status names, which its freshness refers to. */
export type StatusConnection =
    | { readonly kind: "named"; readonly name: string }
    | { readonly kind: "formValues" }
    | { readonly kind: "none" };

export interface DeploymentStatus {
    readonly connection: StatusConnection;
    readonly freshness: DeploymentFreshness;
    /** ISO times of the recorded revision. */
    readonly deployedAt?: string;
    readonly verifiedAt?: string;
}

export type TimestampFormatter = (iso: string) => string;

export function timestampFormatter(_language: string): TimestampFormatter {
    return (iso) => iso;
}

export function deploymentStatusView(
    _status: DeploymentStatus,
    _formatTimestamp: TimestampFormatter,
): StatusView {
    return { text: "", tone: "neutral" };
}
