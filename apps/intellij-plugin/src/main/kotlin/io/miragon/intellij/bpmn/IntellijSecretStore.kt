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
 * **Scope (re-verified for #1065).** [PasswordSafe] is an *application*-level
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

    fun saveBasicAuth(username: String, password: String) =
        passwordSafe.set(basicAuthAttributes, Credentials(username, password))

    fun getBasicAuth(): Credentials? = passwordSafe.get(basicAuthAttributes)

    fun saveOAuth2(clientId: String, clientSecret: String) =
        passwordSafe.set(oauth2Attributes, Credentials(clientId, clientSecret))

    fun getOAuth2(): Credentials? = passwordSafe.get(oauth2Attributes)

    private companion object {
        // generateServiceName namespaces the keychain entry under the IDE +
        // subsystem so it never collides with other plugins' stored secrets.
        const val SUBSYSTEM = "Miranum BPMN Modeler Deployment"
        val basicAuthAttributes = CredentialAttributes(generateServiceName(SUBSYSTEM, "basicAuth"))
        val oauth2Attributes = CredentialAttributes(generateServiceName(SUBSYSTEM, "oauth2"))
    }
}
