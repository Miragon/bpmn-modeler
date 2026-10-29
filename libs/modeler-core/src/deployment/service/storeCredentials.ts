import { AuthConfig } from "../domain/deployment";
import { SecretStorePort } from "../domain/ports";

/** Without a `slot` the credentials stay under the legacy unnamed keys. */
export async function storeCredentials(
    secretStore: SecretStorePort,
    auth: AuthConfig,
    slot?: string,
): Promise<void> {
    if (auth.type === "basic") {
        await secretStore.saveBasicAuth(auth.username, auth.password, slot);
    } else if (auth.type === "oauth2") {
        await secretStore.saveOAuth2(auth.clientId, auth.clientSecret, slot);
    }
}
