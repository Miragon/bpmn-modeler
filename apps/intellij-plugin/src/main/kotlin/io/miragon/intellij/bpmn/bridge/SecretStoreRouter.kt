package io.miragon.intellij.bpmn.bridge

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
            .on("secretStore/saveBasicAuth") { params ->
                val username = params.string("username")
                val password = params.string("password")
                val slot = params.slot()
                RpcAction { id ->
                    secretStore.saveBasicAuth(username, password, slot)
                    id?.let { deps.channel.reply(it, null) }
                }
            }
            .on("secretStore/getBasicAuth") { params ->
                val slot = params.slot()
                RpcAction { id ->
                    val creds = secretStore.getBasicAuth(slot)
                    val username = creds?.userName
                    val password = creds?.getPasswordAsString()
                    id?.let {
                        deps.channel.reply(
                            it,
                            if (username != null && password != null) {
                                BasicAuthCredentials(username, password)
                            } else {
                                null
                            },
                        )
                    }
                }
            }
            .on("secretStore/saveOAuth2") { params ->
                val clientId = params.string("clientId")
                val clientSecret = params.string("clientSecret")
                val slot = params.slot()
                RpcAction { id ->
                    secretStore.saveOAuth2(clientId, clientSecret, slot)
                    id?.let { deps.channel.reply(it, null) }
                }
            }
            .on("secretStore/getOAuth2") { params ->
                val slot = params.slot()
                RpcAction { id ->
                    val creds = secretStore.getOAuth2(slot)
                    val clientId = creds?.userName
                    val clientSecret = creds?.getPasswordAsString()
                    id?.let {
                        deps.channel.reply(
                            it,
                            if (clientId != null && clientSecret != null) {
                                OAuth2Credentials(clientId, clientSecret)
                            } else {
                                null
                            },
                        )
                    }
                }
            }
            .on("secretStore/getApprovedDestinations") { params ->
                val slot = params.string("slot")
                RpcAction { id ->
                    val origins = secretStore.getApprovedDestinations(slot)
                    id?.let { deps.channel.reply(it, origins?.let(::SecretApprovedDestinations)) }
                }
            }
            .on("secretStore/saveApprovedDestinations") { params ->
                val slot = params.string("slot")
                val origins = params.jsonArray("origins").map { it.asString }
                RpcAction { id ->
                    secretStore.saveApprovedDestinations(slot, origins)
                    id?.let { deps.channel.reply(it, null) }
                }
            }
            .on("secretStore/delete") { params ->
                val slot = params.string("slot")
                RpcAction { id ->
                    secretStore.delete(slot)
                    id?.let { deps.channel.reply(it, null) }
                }
            }
    }

    /** Optional `slot`; absent/null addresses the legacy unnamed (ad-hoc) keys. */
    private fun RpcParams.slot(): String? = optionalString("slot")
}
