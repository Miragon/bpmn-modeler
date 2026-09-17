import { DeploymentTarget } from "./deploymentTarget";

/**
 * Freshness of the active editor content relative to what was last deployed to
 * a given target from this machine.
 *
 * - `unknown` — never deployed to this target from this machine (no local record).
 * - `deployed` — content matches the last deploy to this target.
 * - `changed` — content differs from the last deploy to this target.
 */
export type DeploymentFreshness = "unknown" | "deployed" | "changed";

/**
 * Content fingerprint at the moment of a successful deploy, plus when it
 * happened and (for the follow-up engine-verify feature) the server-assigned
 * deployment id.
 */
export interface DeployedRevision {
    readonly fingerprint: string;
    readonly deployedAt: string;
    readonly deploymentId?: string;
}

/**
 * FNV-1a 64-bit as 16 hex chars, computed as two independent 32-bit passes with
 * different seeds and concatenated. No `node:crypto`, so the core stays
 * host-agnostic — matching the `hashSlug` precedent in the template marketplace.
 *
 * EOL is normalised first so a file saved LF vs CRLF fingerprints identically,
 * mirroring `sameDocumentContent` in `EditorSessionStore`.
 */
export function contentFingerprint(content: string): string {
    const normalised = content.replace(/\r\n?/g, "\n");
    return fnv1a(normalised, 0x811c9dc5) + fnv1a(normalised, 0x01000193);
}

function fnv1a(value: string, seed: number): string {
    let hash = seed;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Identifies a deployment destination for ledger keying. A named target keys by
 * its name; ad-hoc mode (no named target) keys by endpoint host + tenant so two
 * different engines behind different URLs never share a ledger slot.
 */
export class DeploymentTargetIdentity {
    private constructor(private readonly value: string) {}

    static fromTarget(target: DeploymentTarget): DeploymentTargetIdentity {
        return new DeploymentTargetIdentity(`target:${target.name.trim()}`);
    }

    static adHoc(endpoint: string, tenantId: string): DeploymentTargetIdentity {
        return new DeploymentTargetIdentity(`adhoc:${endpointHost(endpoint)}/${tenantId}`);
    }

    key(): string {
        return this.value;
    }
}

/** Host of `endpoint` (never the full URL); falls back to the raw string when unparseable. */
function endpointHost(endpoint: string): string {
    try {
        return new URL(endpoint).host || endpoint;
    } catch {
        return endpoint;
    }
}

/**
 * Compares `currentContent` against a recorded revision. A missing revision is
 * `unknown` — no local record, which is not the same as "absent on the engine".
 */
export function freshnessFor(
    revision: DeployedRevision | undefined,
    currentContent: string,
): DeploymentFreshness {
    if (revision === undefined) {
        return "unknown";
    }
    return revision.fingerprint === contentFingerprint(currentContent) ? "deployed" : "changed";
}

/** `${identity}::${filePath}` — the per (target, file) ledger slot. */
export function ledgerKeyFor(identity: DeploymentTargetIdentity, filePath: string): string {
    return `${identity.key()}::${filePath}`;
}
