import { DeploymentTarget } from "./deploymentTarget";
import {
    containsEnvRef,
    EnvLookup,
    EnvReferencing,
    envRefsIn,
    expandEnvRefsLeniently,
} from "./envRef";
import { hostOf } from "./urlTemplate";

/**
 * Freshness of the active editor content relative to what was last deployed to
 * a given target from this machine.
 *
 * - `unknown` — never deployed to this target from this machine (no local record).
 * - `deployed` — content matches the last deploy to this target.
 * - `changed` — content differs from the last deploy to this target.
 * - `superseded` — the engine-origin revision differs from the editor.
 */
export type DeploymentFreshness = "unknown" | "deployed" | "changed" | "superseded";

/**
 * Content fingerprint at the moment of a successful deploy, plus when it
 * happened and the server-assigned deployment id. `origin` marks how the row
 * got here: absent/`"local"` means this machine deployed it, `"engine"` means
 * an on-demand verification adopted it from the engine. `verifiedAt` is set
 * whenever a verification confirmed the row against the engine.
 */
export interface DeployedRevision {
    readonly fingerprint: string;
    readonly deployedAt: string;
    readonly deploymentId?: string;
    readonly origin?: "local" | "engine";
    readonly verifiedAt?: string;
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
 * its name *and* endpoint host, so hand-editing the endpoint in
 * `deployment-targets.json` self-invalidates the old rows instead of reporting
 * a false green against a different engine. Ad-hoc mode (no named target) keys
 * by endpoint host + tenant so two different engines behind different URLs
 * never share a ledger slot.
 */
export class DeploymentTargetIdentity {
    private constructor(private readonly value: string) {}

    /**
     * `lookup` expands env refs so switching `.env` to another engine changes the
     * identity — keying on the literal `${env:URL}` would report a false green.
     */
    static fromTarget(target: DeploymentTarget, lookup: EnvLookup): DeploymentTargetIdentity {
        return new DeploymentTargetIdentity(
            `target:${target.name.trim()}@${hostKey(target.endpoint, lookup)}`,
        );
    }

    /** The fields {@link fromTarget} keys on, so status refreshes skip `.env` otherwise. */
    static envRefsOfTarget(target: DeploymentTarget): EnvReferencing {
        return envRefsIn(target.endpoint);
    }

    static envRefsOfAdHoc(endpoint: string, tenantId: string): EnvReferencing {
        return envRefsIn(endpoint, tenantId);
    }

    static adHoc(endpoint: string, tenantId: string, lookup: EnvLookup): DeploymentTargetIdentity {
        return new DeploymentTargetIdentity(
            `adhoc:${hostKey(endpoint, lookup)}/${resolvedKey(tenantId, lookup)}`,
        );
    }

    key(): string {
        return this.value;
    }
}

/**
 * Host of `endpoint` (never the full URL). Literal endpoints keep their
 * historical key; resolved ones are fingerprinted so no `.env` value is ever
 * written into persisted ledger keys.
 */
function hostKey(endpoint: string, lookup: EnvLookup): string {
    if (!containsEnvRef(endpoint)) {
        return hostOf(endpoint) ?? endpoint;
    }
    const resolved = expandEnvRefsLeniently(endpoint, lookup);
    return `env:${contentFingerprint(hostOf(resolved) ?? resolved)}`;
}

function resolvedKey(value: string, lookup: EnvLookup): string {
    return containsEnvRef(value)
        ? `env:${contentFingerprint(expandEnvRefsLeniently(value, lookup))}`
        : value;
}

/**
 * Compares `currentContent` against a recorded revision. A missing revision is
 * `unknown` — no local record, which is not the same as "absent on the engine".
 * A mismatch against an engine-origin revision is `superseded`, not `changed`;
 * the next local deploy writes a local-origin row and leaves that state again.
 */
export function freshnessFor(
    revision: DeployedRevision | undefined,
    currentContent: string,
): DeploymentFreshness {
    if (revision === undefined) {
        return "unknown";
    }
    if (revision.fingerprint === contentFingerprint(currentContent)) {
        return "deployed";
    }
    return revision.origin === "engine" ? "superseded" : "changed";
}

/** `${identity}::${filePath}` — the per (target, file) ledger slot. */
export function ledgerKeyFor(identity: DeploymentTargetIdentity, filePath: string): string {
    return `${identity.key()}::${filePath}`;
}

/** Prefix matching every ledger slot of `identity`, for pruning on delete/rename. */
export function ledgerKeyPrefixFor(identity: DeploymentTargetIdentity): string {
    return `${identity.key()}::`;
}
