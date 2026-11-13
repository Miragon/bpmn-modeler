package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.ui.Messages
import io.miragon.intellij.bpmn.AddMarketplaceDialog
import io.miragon.intellij.bpmn.IntellijMarketplaceTokenStore
import io.miragon.intellij.bpmn.MarketplaceAddAnswer
import io.miragon.intellij.bpmn.MarketplaceAddQuestion
import io.miragon.intellij.bpmn.MarketplaceScopeChoice
import io.miragon.intellij.bpmn.ModelerSettingsConfigurable
import io.miragon.intellij.bpmn.ModelerSettingsStore
import io.miragon.intellij.bpmn.ProjectMarketplacesStore
import io.miragon.intellij.bpmn.ProjectScope
import io.miragon.intellij.bpmn.pushSettingsToRunningBridges

/**
 * Routes the template-marketplace seam: the core→host requests the marketplace
 * flows need (the stores per scope, the add form, the per-host token ports)
 * plus the outbound `marketplace/add` / `marketplace/update` /
 * `marketplace/remove` notifications the Tools-menu actions fire.
 *
 * The add form and the token prompt are modal dialogs that *must* run on the
 * EDT, so they are marshalled there (mirroring `HostUiRouter.handlePick`).
 */
internal class MarketplaceRouter(
    private val deps: BridgeDeps,
    // Seams for tests only: the real prompts are modal dialogs, which are
    // EDT-only and not headless-stubbable, so a test injects deterministic
    // stand-ins. Each returns the answer as entered, or null on cancel.
    private val passwordPrompt: (title: String, prompt: String) -> String? = { title, prompt ->
        Messages.showPasswordDialog(deps.project, prompt, title, null)
    },
    private val addForm: (MarketplaceAddQuestion) -> MarketplaceAddAnswer? = { question ->
        AddMarketplaceDialog(deps.project, question).ask()
    },
    // No CoreProcess runs under the test fixture, so a test observes the pushes here.
    private val pushToRunningBridges: () -> Unit = ::pushSettingsToRunningBridges,
    private val pushToOwnBridge: () -> Unit,
) {
    private val tokenStore by lazy { IntellijMarketplaceTokenStore() }

    fun register() {
        deps.handlers
            .on("marketplaceState/read") {
                RpcAction { id -> id?.let { deps.channel.reply(it, readState()) } }
            }
            .on("marketplaceState/save") { params ->
                val location = params.string("location")
                val scope = params.string("scope")
                RpcAction { id -> handleStateSave(location, ProjectScope.ofWireName(scope), id) }
            }
            .on("marketplaceState/remove") { params ->
                val locations = params.jsonArray("entries").map { it.asString }
                RpcAction { id -> handleStateRemove(locations, id) }
            }
            .on("marketplacePrompt/show") { params ->
                val question = readQuestion(params)
                RpcAction { id -> handleAddForm(question, id) }
            }
            .on("tokenStore/get") { params ->
                val host = params.string("host")
                deps.credentialStoreAction("tokenStore/get") {
                    tokenStore.getToken(host)?.let(::TokenStoreGetResult)
                }
            }
            .on("tokenStore/set") { params ->
                val host = params.string("host")
                val token = params.string("token")
                deps.credentialStoreAction("tokenStore/set") {
                    tokenStore.setToken(host, token)
                    null
                }
            }
            .on("tokenPrompt/show") { params ->
                val title = params.string("title")
                val prompt = params.string("prompt")
                RpcAction { id -> handleTokenPrompt(title, prompt, id) }
            }
    }

    // ── core → host requests ──────────────────────────────────────────────────

    private fun readState(): MarketplaceStateReadResult =
        MarketplaceStateReadResult(
            registered =
                mapOf(
                    ProjectScope.PROJECT.wireName to ProjectMarketplacesStore.getInstance(deps.project).list(),
                    ProjectScope.ALL_PROJECTS.wireName to ModelerSettingsStore.getInstance().current().marketplaces,
                ),
            writable = WRITABLE_SCOPES,
        )

    /**
     * Persists the just-fetched registration in the scope the user chose, then
     * acks, so a persist failure surfaces as a rejected promise on the core.
     *
     * - [ProjectScope.PROJECT]: persist to *this* project's store and refresh
     *   only its own bridge; a sibling window must not inherit it.
     * - [ProjectScope.ALL_PROJECTS]: persist app-wide and fan the fresh
     *   snapshot to *every* open window, since each one's merged list changed.
     */
    private fun handleStateSave(location: String, scope: ProjectScope, id: CoreRequestId?) {
        if (scope == ProjectScope.ALL_PROJECTS) {
            ModelerSettingsStore.getInstance().addMarketplace(location)
            pushToRunningBridges()
        } else {
            ProjectMarketplacesStore.getInstance(deps.project).add(location)
            pushToOwnBridge()
        }
        id?.let { deps.channel.reply(it, null) }
    }

    /**
     * Removes the entries from every store that holds them and pushes the
     * reduced list before the ack, so the core's prune reads it. An app-level
     * removal changed every window's merged list, so it reaches every bridge.
     */
    private fun handleStateRemove(locations: List<String>, id: CoreRequestId?) {
        val appStore = ModelerSettingsStore.getInstance()
        val appChanged = appStore.current().marketplaces.any { it in locations }
        appStore.removeMarketplaces(locations)
        ProjectMarketplacesStore.getInstance(deps.project).remove(locations)
        if (appChanged) {
            pushToRunningBridges()
        } else {
            pushToOwnBridge()
        }
        id?.let { deps.channel.reply(it, null) }
    }

    /** Shows the core's add question in one form and replies with the answer as entered. */
    private fun handleAddForm(question: MarketplaceAddQuestion, id: CoreRequestId?) {
        if (id == null) return
        deps.channel.replyFromEdt(id, "marketplacePrompt/show") {
            if (deps.project.isDisposed) return@replyFromEdt null
            addForm(question)?.let { MarketplacePromptShowResult(it.location, it.scope) }
        }
    }

    /**
     * Shows the core's title and prompt in a modal password dialog on the EDT and
     * replies with the answer as typed, or `null` on cancel or a disposed project
     * (mirrors `handlePick`). The core judges a blank answer.
     */
    private fun handleTokenPrompt(title: String, prompt: String, id: CoreRequestId?) {
        if (id == null) return
        deps.channel.replyFromEdt(id, "tokenPrompt/show") {
            if (deps.project.isDisposed) return@replyFromEdt null
            passwordPrompt(title, prompt)?.let(::TokenPromptShowResult)
        }
    }

    // ── host → core notifications ─────────────────────────────────────────────

    /**
     * Each piggybacks the settings snapshot, so a flow never depends on a prior
     * `session/register` seed: an action can run before any editor is open. The
     * notify buffers in the outbound queue until the bridge spawns, so the
     * trailing [ensureStartedAsync][BridgeDeps.ensureStartedAsync] is enough.
     */
    fun addMarketplace() = notifyWithSettings(HostToCoreMethod.MARKETPLACE_ADD)

    fun updateMarketplaces() = notifyWithSettings(HostToCoreMethod.MARKETPLACE_UPDATE)

    fun removeMarketplaces() = notifyWithSettings(HostToCoreMethod.MARKETPLACE_REMOVE)

    private fun notifyWithSettings(method: HostToCoreMethod) {
        deps.channel.notify(
            method,
            linkedMapOf("settings" to ModelerSettingsStore.getInstance().snapshotMap(deps.project)),
        )
        deps.ensureStartedAsync()
    }

    private fun readQuestion(params: RpcParams): MarketplaceAddQuestion =
        MarketplaceAddQuestion(
            title = params.string("title"),
            prompt = params.string("prompt"),
            placeholder = params.string("placeholder"),
            location = params.string("location"),
            invalidLocation = params.optionalString("invalidLocation"),
            scopes =
                params.jsonArray("scopes").map { element ->
                    val choice = element.asJsonObject
                    MarketplaceScopeChoice(
                        scope = choice.get("scope").asString,
                        label = choice.get("label").asString,
                        description = choice.get("description").asString,
                    )
                },
            scope = params.string("scope"),
        )

    private companion object {
        val WRITABLE_SCOPES =
            listOf(
                WritableScope(
                    ProjectScope.PROJECT.wireName,
                    SettingsPlace("file", listOf(".idea", "workspace.xml")),
                ),
                WritableScope(
                    ProjectScope.ALL_PROJECTS.wireName,
                    SettingsPlace(
                        "settingsPage",
                        listOf(
                            "Settings",
                            "Tools",
                            ModelerSettingsConfigurable.DISPLAY_NAME,
                            ModelerSettingsConfigurable.MARKETPLACES_GROUP,
                        ),
                    ),
                ),
            )
    }
}
