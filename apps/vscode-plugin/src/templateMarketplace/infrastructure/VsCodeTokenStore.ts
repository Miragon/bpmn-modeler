import { TokenStorePort } from "@miragon/bpmn-modeler-core";

import { getContext } from "../../shared/infrastructure/extensionContext";

// Key prefix for marketplace tokens, kept disjoint from `bpmn-modeler.deployment.*`
// so the two credential kinds never collide in the same secret namespace.
const TOKEN_PREFIX = "bpmn-modeler.marketplace.token";

/**
 * Adapter over VS Code's {@link SecretStorage} for per-host marketplace tokens.
 *
 * Keyed by host so `github.com` stays distinct from a future GitLab or GHE
 * origin. A repeated {@link setToken} overwrites — that is how the service
 * expresses token rotation.
 */
export class VsCodeTokenStore implements TokenStorePort {
    async getToken(host: string): Promise<string | undefined> {
        return getContext().secrets.get(`${TOKEN_PREFIX}.${host}`);
    }

    async setToken(host: string, token: string): Promise<void> {
        await getContext().secrets.store(`${TOKEN_PREFIX}.${host}`, token);
    }
}
