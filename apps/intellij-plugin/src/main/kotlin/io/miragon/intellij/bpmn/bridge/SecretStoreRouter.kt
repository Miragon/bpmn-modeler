package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import io.miragon.intellij.bpmn.IntellijSecretStore

/**
 * Routes the core's `SecretStorePort` to IntelliJ's PasswordSafe. These are the
 * only reply-bearing inbound handlers: get/set both block, and PasswordSafe must
 * not be touched on the EDT — `onLine` runs them on the background reader thread,
 * so calling them inline is safe.
 */
internal class SecretStoreRouter(private val deps: BridgeDeps) {
    private val secretStore by lazy { IntellijSecretStore() }

    fun register() {
        deps.handlers
            .on("secretStore/saveBasicAuth") { params, id ->
                secretStore.saveBasicAuth(
                    params.get("username").asString,
                    params.get("password").asString,
                    params.slot(),
                )
                id?.let { deps.channel.reply(it, null) }
            }
            .on("secretStore/getBasicAuth") { params, id ->
                val creds = secretStore.getBasicAuth(params.slot())
                val username = creds?.userName
                val password = creds?.getPasswordAsString()
                id?.let {
                    deps.channel.reply(
                        it,
                        if (username != null && password != null) {
                            mapOf("username" to username, "password" to password)
                        } else {
                            null
                        },
                    )
                }
            }
            .on("secretStore/saveOAuth2") { params, id ->
                secretStore.saveOAuth2(
                    params.get("clientId").asString,
                    params.get("clientSecret").asString,
                    params.slot(),
                )
                id?.let { deps.channel.reply(it, null) }
            }
            .on("secretStore/getOAuth2") { params, id ->
                val creds = secretStore.getOAuth2(params.slot())
                val clientId = creds?.userName
                val clientSecret = creds?.getPasswordAsString()
                id?.let {
                    deps.channel.reply(
                        it,
                        if (clientId != null && clientSecret != null) {
                            mapOf("clientId" to clientId, "clientSecret" to clientSecret)
                        } else {
                            null
                        },
                    )
                }
            }
            .on("secretStore/delete") { params, id ->
                secretStore.delete(params.get("slot").asString)
                id?.let { deps.channel.reply(it, null) }
            }
    }

    /** Optional `slot`; absent/null addresses the legacy unnamed (ad-hoc) keys. */
    private fun JsonObject.slot(): String? = get("slot")?.takeIf { !it.isJsonNull }?.asString
}
