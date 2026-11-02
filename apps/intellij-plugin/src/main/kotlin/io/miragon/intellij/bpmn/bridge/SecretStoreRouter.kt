package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.IntellijSecretStore

/** Routes the core's `SecretStorePort` to IntelliJ's PasswordSafe. */
internal class SecretStoreRouter(private val deps: BridgeDeps) {
    private val secretStore by lazy { IntellijSecretStore() }

    fun register() {
        deps.handlers
            .on("secretStore/saveBasicAuth") { params ->
                val username = params.string("username")
                val password = params.string("password")
                val slot = params.slot()
                deps.credentialStoreAction("secretStore/saveBasicAuth") {
                    secretStore.saveBasicAuth(username, password, slot)
                    null
                }
            }
            .on("secretStore/getBasicAuth") { params ->
                val slot = params.slot()
                deps.credentialStoreAction("secretStore/getBasicAuth") {
                    val creds = secretStore.getBasicAuth(slot)
                    val username = creds?.userName
                    val password = creds?.getPasswordAsString()
                    if (username != null && password != null) {
                        BasicAuthCredentials(username, password)
                    } else {
                        null
                    }
                }
            }
            .on("secretStore/saveOAuth2") { params ->
                val clientId = params.string("clientId")
                val clientSecret = params.string("clientSecret")
                val slot = params.slot()
                deps.credentialStoreAction("secretStore/saveOAuth2") {
                    secretStore.saveOAuth2(clientId, clientSecret, slot)
                    null
                }
            }
            .on("secretStore/getOAuth2") { params ->
                val slot = params.slot()
                deps.credentialStoreAction("secretStore/getOAuth2") {
                    val creds = secretStore.getOAuth2(slot)
                    val clientId = creds?.userName
                    val clientSecret = creds?.getPasswordAsString()
                    if (clientId != null && clientSecret != null) {
                        OAuth2Credentials(clientId, clientSecret)
                    } else {
                        null
                    }
                }
            }
            .on("secretStore/getApprovedDestinations") { params ->
                val slot = params.string("slot")
                deps.credentialStoreAction("secretStore/getApprovedDestinations") {
                    secretStore.getApprovedDestinations(slot)?.let(::SecretApprovedDestinations)
                }
            }
            .on("secretStore/saveApprovedDestinations") { params ->
                val slot = params.string("slot")
                val origins = params.jsonArray("origins").map { it.asString }
                deps.credentialStoreAction("secretStore/saveApprovedDestinations") {
                    secretStore.saveApprovedDestinations(slot, origins)
                    null
                }
            }
            .on("secretStore/delete") { params ->
                val slot = params.string("slot")
                deps.credentialStoreAction("secretStore/delete") {
                    secretStore.delete(slot)
                    null
                }
            }
    }

    /** Optional `slot`; absent/null addresses the legacy unnamed (ad-hoc) keys. */
    private fun RpcParams.slot(): String? = optionalString("slot")
}
