import { contentFingerprint, DeployedRevision } from "./deploymentLedger";
import {
    CredentialDestinationError,
    EngineInspectionFailedError,
    EnvReferenceError,
} from "./errors";

/**
 * What a Camunda 7 engine reports for the latest deployed version of a process:
 * the definition/deployment ids, the deployed resource bytes, and (best-effort)
 * when it was deployed.
 */
export interface EngineDeploymentSnapshot {
    readonly processDefinitionId: string;
    readonly deploymentId: string;
    readonly resourceName: string;
    readonly xml: string;
    readonly deploymentTime?: string;
}

/**
 * - `current` — the engine still runs the deployment this machine recorded.
 * - `adopted` — the engine's latest version matches the editor content, so the
 *   row is (re-)seeded from the engine (covers colleague deploys, fresh clones).
 * - `superseded` — the engine's deployed version differs from the editor.
 * - `missing` — the process is not deployed on the engine.
 */
export type VerificationOutcome = "current" | "adopted" | "superseded" | "missing";

/**
 * Reconciles the local ledger row against what the engine reports. Pure: the
 * caller applies `revision` to the ledger (`missing` means delete the row).
 */
export function reconcile(
    recorded: DeployedRevision | undefined,
    currentContent: string,
    snapshot: EngineDeploymentSnapshot | undefined,
): { outcome: VerificationOutcome; revision?: DeployedRevision } {
    if (snapshot === undefined) {
        return { outcome: "missing" };
    }

    const verifiedAt = new Date().toISOString();
    if (recorded?.deploymentId !== undefined && recorded.deploymentId === snapshot.deploymentId) {
        return { outcome: "current", revision: { ...recorded, verifiedAt } };
    }

    const engineFingerprint = contentFingerprint(stripBom(snapshot.xml));
    const outcome =
        engineFingerprint === contentFingerprint(stripBom(currentContent))
            ? "adopted"
            : "superseded";
    return {
        outcome,
        revision: {
            fingerprint: engineFingerprint,
            deployedAt: snapshot.deploymentTime ?? verifiedAt,
            deploymentId: snapshot.deploymentId,
            origin: "engine",
            verifiedAt,
        },
    };
}

/** C7 returns the stored resource bytes, which may carry a UTF-8 BOM the editor buffer lacks. */
function stripBom(content: string): string {
    return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

/** What a verification learned, for the message that reports it. */
export interface VerificationFacts {
    readonly targetName: string;
    readonly processKey: string;
    /** What {@link reconcile} wrote to the ledger. */
    readonly revision?: DeployedRevision;
    readonly snapshot?: EngineDeploymentSnapshot;
}

const OUTCOME_MESSAGES: Record<VerificationOutcome, (facts: VerificationFacts) => string> = {
    current: ({ targetName, revision }) =>
        `Verified: ${targetName} runs your last deployment${timeNote(revision?.deployedAt)}.`,
    adopted: ({ targetName, revision }) =>
        `Verified: ${targetName} runs exactly this diagram${timeNote(revision?.deployedAt, "deployed ")}.`,
    superseded: ({ targetName, snapshot }) =>
        `The version deployed on ${targetName}${timeNote(snapshot?.deploymentTime, "deployed ")} differs from your diagram.`,
    missing: ({ targetName, processKey }) =>
        `Process '${processKey}' is not deployed on ${targetName}.`,
};

export function verificationMessage(
    outcome: VerificationOutcome,
    facts: VerificationFacts,
): string {
    return OUTCOME_MESSAGES[outcome](facts);
}

/** ` (<label>14:40)`, or nothing for a missing or unreadable time. */
function timeNote(iso: string | undefined, label = ""): string {
    const date = new Date(iso ?? Number.NaN);
    if (Number.isNaN(date.getTime())) return "";
    return ` (${label}${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })})`;
}

/** An `explained` failure tells the user what to fix; an `unexpected` one is logged with its stack. */
export type VerificationFailureNotice =
    | { readonly kind: "explained"; readonly message: string }
    | { readonly kind: "unexpected"; readonly title: string };

export function verificationFailureNotice(
    error: unknown,
    targetName: string,
): VerificationFailureNotice {
    if (error instanceof EngineInspectionFailedError && error.isAuthFailure) {
        return {
            kind: "explained",
            message: `Could not verify deployment on "${targetName}" — check the target credentials.`,
        };
    }
    if (error instanceof EnvReferenceError || error instanceof CredentialDestinationError) {
        return { kind: "explained", message: error.message };
    }
    return { kind: "unexpected", title: "Could not verify deployment" };
}
