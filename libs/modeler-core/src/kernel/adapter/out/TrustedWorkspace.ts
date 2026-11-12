import { WorkspaceTrustPort } from "../../port/hostPorts";

// Trust never changes here, so there is nothing to stop listening to.
const UNCHANGING = { dispose: () => undefined };

/** For a host without a trust feature: Orca and npm consumers run no workspace code. */
export const TRUSTED_WORKSPACE: WorkspaceTrustPort = {
    isTrusted: () => true,
    onDidChange: () => UNCHANGING,
};

/** A host's own trust, else {@link TRUSTED_WORKSPACE}. */
export function trustOrTrusted(trust: WorkspaceTrustPort | undefined): WorkspaceTrustPort {
    return trust ?? TRUSTED_WORKSPACE;
}
