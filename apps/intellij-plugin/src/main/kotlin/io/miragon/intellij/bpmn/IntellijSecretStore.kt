package io.miragon.intellij.bpmn

import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.Credentials
import com.intellij.credentialStore.generateServiceName
import com.intellij.ide.passwordSafe.PasswordSafe

/**
 * Drives the core's `SecretStorePort` against IntelliJ's [PasswordSafe], the host
 * equivalent of VS Code's `context.secrets` for deployment basic-auth / OAuth2
 * credentials.
 *
 * **Scope.** [PasswordSafe] is an *application*-level
 * service (`PasswordSafe.instance` == `service<PasswordSafe>()`), **not**
 * project-scoped: secrets are keyed only by [CredentialAttributes] and shared
 * across every project window and IDE restart, encrypted at rest in the OS
 * keychain (or an encrypted KeePass DB). That matches the VS Code `SecretStorage`
 * scope the core was written against (global per extension), so no per-project
 * disambiguation is needed.
 *
 * Username/clientId and password/secret travel together in one [Credentials] entry
 * per auth kind, so a paired read never returns a half-populated result.
 */
class IntellijSecretStore {
    private val passwordSafe get() = PasswordSafe.instance

    fun saveBasicAuth(username: String, password: String, slot: String?) =
        passwordSafe.set(attributesFor("basicAuth", slot), Credentials(username, password))

    fun getBasicAuth(slot: String?): Credentials? = passwordSafe.get(attributesFor("basicAuth", slot))

    fun saveOAuth2(clientId: String, clientSecret: String, slot: String?) =
        passwordSafe.set(attributesFor("oauth2", slot), Credentials(clientId, clientSecret))

    fun getOAuth2(slot: String?): Credentials? = passwordSafe.get(attributesFor("oauth2", slot))

    /** Removes every credential kind stored under [slot] (target delete / rename). */
    fun delete(slot: String) {
        passwordSafe.set(attributesFor("basicAuth", slot), null)
        passwordSafe.set(attributesFor("oauth2", slot), null)
    }

    private companion object {
        // generateServiceName namespaces the keychain entry under the IDE +
        // subsystem so it never collides with other plugins' stored secrets. A
        // slot (`<targetsFile>::<name>`) scopes credentials to a named target;
        // `null` keeps the legacy unnamed keys (ad-hoc mode). PasswordSafe is
        // application-scoped, so the targets-file path in the slot is what keeps
        // a "dev" target in two workspaces from colliding.
        const val SUBSYSTEM = "Miragon BPMN Modeler Deployment"

        fun attributesFor(kind: String, slot: String?): CredentialAttributes {
            val key = if (slot == null) kind else "$kind:$slot"
            return CredentialAttributes(generateServiceName(SUBSYSTEM, key))
        }
    }
}
