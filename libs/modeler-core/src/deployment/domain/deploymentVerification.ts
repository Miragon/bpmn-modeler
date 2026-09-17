import { contentFingerprint, DeployedRevision } from "./deploymentLedger";

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
 * - `superseded` — the engine holds a newer version that differs from the editor.
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
