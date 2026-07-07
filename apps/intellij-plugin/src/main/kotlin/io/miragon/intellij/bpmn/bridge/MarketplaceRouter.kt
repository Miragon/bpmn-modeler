package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonObject
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages
import io.miragon.intellij.bpmn.CoreProcess
import io.miragon.intellij.bpmn.IntellijMarketplaceTokenStore
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.ProjectMarketplacesStore
import io.miragon.intellij.bpmn.pushSettingsToRunningBridges

/**
 * Routes the template-marketplace seam: the two Core→Host requests the marketplace
 * service needs (the acknowledged registration persist, and the two per-host token
 * ports) plus the outbound `marketplace/add` / `marketplace/update` notifications
 * the Tools-menu actions fire.
 *
 * The token get/set run inline on the reader thread — [PasswordSafe][
 * com.intellij.ide.passwordSafe.PasswordSafe] must not touch the EDT, exactly like
 * [SecretStoreRouter]. The token prompt is the opposite: a modal dialog that *must*
 * run on the EDT, so it is marshalled there (mirroring `HostUiRouter.handlePick`).
 */
internal class MarketplaceRouter(
    private val deps: BridgeDeps,
    // Seam for tests only: the real prompt is a modal password dialog, which is
    // EDT-only and not headless-stubbable, so a test injects a deterministic
    // stand-in. Returns the entered token, or null on cancel.
    private val passwordPrompt: (host: String, reason: String) -> String? = { host, reason ->
        Messages.showPasswordDialog(deps.project, reason, "Personal Access Token for $host", null)
    },
) {
    private val tokenStore by lazy { IntellijMarketplaceTokenStore() }

    fun register() {
        deps.handlers
            .on("marketplaceState/save") { params, id -> handleStateSave(params, id) }
            .on("tokenStore/get") { params, id -> handleTokenGet(params, id) }
            .on("tokenStore/set") { params, id -> handleTokenSet(params, id) }
            .on("tokenPrompt/show") { params, id -> handleTokenPrompt(params, id) }
    }

    // ── core → host requests ──────────────────────────────────────────────────

    /**
     * Persists the just-fetched registration at the scope the Add action chose,
     * echoed back opaquely from `marketplace/add` (absent → `"project"`, so an add
     * that carried none stays per-project as before). Acked so a persist failure
     * surfaces as a rejected promise on the core rather than being silently dropped.
     *
     * - `"project"`: a per-project concern — persist to *this* project's store and
     *   refresh only its own bridge; a sibling window must not inherit it.
     * - `"application"`: the "all my projects" list — persist app-wide and fan the
     *   fresh snapshot to *every* open window, since each one's merged list changed.
     */
    private fun handleStateSave(params: JsonObject, id: Int?) {
        val location = params.get("location").asString
        val scope = params.get("scope")?.takeIf { !it.isJsonNull }?.asString ?: "project"
        if (scope == "application") {
            ModelerSettingsStore.getInstance().addMarketplace(location)
            pushSettingsToRunningBridges()
        } else {
            ProjectMarketplacesStore.getInstance(deps.project).add(location)
            deps.project.getServiceIfCreated(CoreProcess::class.java)?.pushSettings()
        }
        id?.let { deps.channel.reply(it, null) }
    }

    private fun handleTokenGet(params: JsonObject, id: Int?) {
        val token = tokenStore.getToken(params.get("host").asString)
        id?.let { deps.channel.reply(it, if (token != null) mapOf("token" to token) else null) }
    }

    private fun handleTokenSet(params: JsonObject, id: Int?) {
        tokenStore.setToken(params.get("host").asString, params.get("token").asString)
        id?.let { deps.channel.reply(it, null) }
    }

    /**
     * Shows a modal password dialog on the EDT and replies with the entered token,
     * or `null` on cancel / blank / a disposed project (mirrors `handlePick`). A
     * blank entry maps to `null` core-side too, but guarding here keeps an empty
     * token from ever being stored as a valid one.
     */
    private fun handleTokenPrompt(params: JsonObject, id: Int?) {
        if (id == null) return
        val host = params.get("host").asString
        val reason = params.get("reason")?.takeIf { !it.isJsonNull }?.asString.orEmpty()
        ApplicationManager.getApplication().invokeLater {
            if (deps.project.isDisposed) {
                deps.channel.reply(id, null)
                return@invokeLater
            }
            val token = passwordPrompt(host, reason)?.trim()
            deps.channel.reply(id, if (!token.isNullOrEmpty()) mapOf("token" to token) else null)
        }
    }

    // ── host → core notifications ─────────────────────────────────────────────

    /**
     * Fires `marketplace/add`, piggybacking the settings snapshot so the run never
     * depends on a prior `session/register` seed — the action can be invoked before
     * any editor is open. The notify buffers in the outbound queue until the bridge
     * spawns, so the trailing [ensureStartedAsync][BridgeDeps.ensureStartedAsync]
     * is enough to guarantee delivery.
     */
    fun addMarketplace(location: String, appWide: Boolean) {
        deps.channel.notify(
            "marketplace/add",
            linkedMapOf(
                "location" to location,
                // Opaque to the core: it rides the round trip and comes back on
                // `marketplaceState/save`, which is where the host actually persists.
                "scope" to if (appWide) "application" else "project",
                "settings" to ModelerSettingsStore.getInstance().snapshotMap(deps.project),
            ),
        )
        deps.ensureStartedAsync()
    }

    /** Fires `marketplace/update`; the core re-reads the piggybacked marketplace list. */
    fun updateMarketplaces() {
        deps.channel.notify(
            "marketplace/update",
            linkedMapOf("settings" to ModelerSettingsStore.getInstance().snapshotMap(deps.project)),
        )
        deps.ensureStartedAsync()
    }
}
