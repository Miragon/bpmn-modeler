package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.ui.Messages
import io.miragon.intellij.bpmn.CoreProcess
import io.miragon.intellij.bpmn.IntellijMarketplaceTokenStore
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.ProjectMarketplacesStore
import io.miragon.intellij.bpmn.pushSettingsToRunningBridges

/**
 * Routes the template-marketplace seam: the two Core→Host requests the marketplace
 * service needs (the acknowledged registration persist, and the two per-host token
 * ports) plus the outbound `marketplace/add` / `marketplace/update` /
 * `marketplace/remove` notifications the Tools-menu actions fire.
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
    // stand-in. Returns the answer as typed, or null on cancel.
    private val passwordPrompt: (title: String, prompt: String) -> String? = { title, prompt ->
        Messages.showPasswordDialog(deps.project, prompt, title, null)
    },
) {
    private val tokenStore by lazy { IntellijMarketplaceTokenStore() }

    fun register() {
        deps.handlers
            .on("marketplaceState/save") { params ->
                val location = params.string("location")
                val scope = params.optionalString("scope") ?: "project"
                RpcAction { id -> handleStateSave(location, scope, id) }
            }
            .on("tokenStore/get") { params ->
                val host = params.string("host")
                RpcAction { id -> handleTokenGet(host, id) }
            }
            .on("tokenStore/set") { params ->
                val host = params.string("host")
                val token = params.string("token")
                RpcAction { id -> handleTokenSet(host, token, id) }
            }
            .on("tokenPrompt/show") { params ->
                val title = params.string("title")
                val prompt = params.string("prompt")
                RpcAction { id -> handleTokenPrompt(title, prompt, id) }
            }
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
    private fun handleStateSave(location: String, scope: String, id: Int?) {
        if (scope == "application") {
            ModelerSettingsStore.getInstance().addMarketplace(location)
            pushSettingsToRunningBridges()
        } else {
            ProjectMarketplacesStore.getInstance(deps.project).add(location)
            deps.project.getServiceIfCreated(CoreProcess::class.java)?.pushSettings()
        }
        id?.let { deps.channel.reply(it, null) }
    }

    private fun handleTokenGet(host: String, id: Int?) {
        val token = tokenStore.getToken(host)
        id?.let { deps.channel.reply(it, token?.let(::TokenStoreGetResult)) }
    }

    private fun handleTokenSet(host: String, token: String, id: Int?) {
        tokenStore.setToken(host, token)
        id?.let { deps.channel.reply(it, null) }
    }

    /**
     * Shows the core's title and prompt in a modal password dialog on the EDT and
     * replies with the answer as typed, or `null` on cancel or a disposed project
     * (mirrors `handlePick`). The core judges a blank answer.
     */
    private fun handleTokenPrompt(title: String, prompt: String, id: Int?) {
        if (id == null) return
        deps.channel.replyFromEdt(id, "tokenPrompt/show") {
            if (deps.project.isDisposed) return@replyFromEdt null
            passwordPrompt(title, prompt)?.let(::TokenPromptShowResult)
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

    /**
     * Fires `marketplace/remove`: the host already unregistered the selected
     * entries, so the piggybacked snapshot is the *post-removal* list. The core
     * prunes their orphaned cache slots without re-fetching the survivors and
     * refreshes open editors. [removedCount] is the selection size, echoed into
     * the core's summary toast (the prune count would understate it — a removed
     * entry may have held no cache slot).
     */
    fun removeMarketplaces(removedCount: Int) {
        deps.channel.notify(
            "marketplace/remove",
            linkedMapOf(
                "settings" to ModelerSettingsStore.getInstance().snapshotMap(deps.project),
                "removedCount" to removedCount,
            ),
        )
        deps.ensureStartedAsync()
    }
}
