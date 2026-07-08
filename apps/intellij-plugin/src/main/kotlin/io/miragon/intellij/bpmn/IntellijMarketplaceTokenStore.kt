package io.miragon.intellij.bpmn

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe

/**
 * Drives the core's `TokenStorePort` against IntelliJ's [PasswordSafe] for the
 * per-host personal access tokens that reach private template-marketplace repos.
 *
 * **Distinct subsystem.** The service name namespace
 * (`"Miragon BPMN Modeler Marketplace"`) is deliberately separate from
 * deployment's [IntellijSecretStore] (`"… Deployment"`) so a marketplace PAT and
 * a deployment credential never collide in the keychain — they are unrelated
 * secrets keyed differently (deployment by auth kind, marketplace by host).
 *
 * **Scope.** [PasswordSafe] is application-level (shared across every project
 * window and IDE restart, encrypted at rest), matching the VS Code `SecretStorage`
 * scope the core was written against — so no per-project disambiguation is needed.
 *
 * The token rides as the [Credentials] password; the host name is stored as the
 * user so an entry is self-describing when inspected.
 */
class IntellijMarketplaceTokenStore {
    private val passwordSafe get() = PasswordSafe.instance

    fun getToken(host: String): String? = passwordSafe.get(attributesFor(host))?.getPasswordAsString()

    /** An overwrite for an existing host is how the core expresses token rotation. */
    fun setToken(host: String, token: String) =
        passwordSafe.set(attributesFor(host), Credentials(host, token))

    private companion object {
        const val SUBSYSTEM = "Miragon BPMN Modeler Marketplace"

        // generateServiceName keys the entry under IDE + subsystem + host, so
        // github.com stays distinct from a self-hosted GHE origin and from every
        // other plugin's secrets.
        fun attributesFor(host: String) = CredentialAttributes(generateServiceName(SUBSYSTEM, host))
    }
}
