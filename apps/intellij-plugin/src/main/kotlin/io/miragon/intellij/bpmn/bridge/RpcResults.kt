package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.project.Project
import io.miragon.intellij.bpmn.PluginApproval
import io.miragon.intellij.bpmn.PluginApprovalSnapshot
import io.miragon.intellij.bpmn.ProjectTemplatePreferenceStore
import io.miragon.intellij.bpmn.TemplatePreferenceSnapshot
import io.miragon.intellij.bpmn.TemplatePreferenceStore

/**
 * The host's answer to one core→host request. Gson writes a result's property
 * names as the reply's keys, so renaming a property changes the wire protocol.
 */
internal interface RpcResult

internal class DocumentWriteResult(
    val changed: Boolean,
    val accepted: Boolean,
    /** Set only when the Document holds other bytes than the core wrote. */
    val normalizedContent: String? = null,
) : RpcResult

internal class DocumentSaveResult(val saved: Boolean) : RpcResult

/** [selected] is null when the user dismissed the chooser. */
internal class PickerShowResult(val selected: List<Int>?) : RpcResult

internal class ActionNoticeShowResult(val chosen: Int?) : RpcResult

internal class ConfirmShowResult(val confirmed: Boolean) : RpcResult

/** Whether the BPMN Modeler tool window now shows its Artifacts tab. */
internal class AddOnsRevealResult(val shown: Boolean) : RpcResult

internal class ClipboardReadResult(val text: String) : RpcResult

internal class BasicAuthCredentials(val username: String, val password: String) : RpcResult

internal class OAuth2Credentials(val clientId: String, val clientSecret: String) : RpcResult

internal class SecretApprovedDestinations(val origins: List<String>) : RpcResult

internal class TokenStoreGetResult(val token: String) : RpcResult

internal class TokenPromptShowResult(val token: String) : RpcResult

internal class MarketplacePromptShowResult(val location: String, val scope: String) : RpcResult

/** [registered] holds each scope's own list, keyed by the scope's wire name. */
internal class MarketplaceStateReadResult(
    val registered: Map<String, List<String>>,
    val writable: List<WritableScope>,
) : RpcResult

internal class WritableScope(val scope: String, val savedIn: SettingsPlace)

internal class SettingsPlace(val kind: String, val path: List<String>)

/** The approvals the host stores, with their revision: after a `pluginApprovals/change`, or for a `pluginApprovals/read`. */
internal class PluginApprovalsResult(val approvals: List<PluginApproval>, val revision: Long) : RpcResult {
    constructor(snapshot: PluginApprovalSnapshot) : this(snapshot.approvals, snapshot.revision)
}

/**
 * Both scopes' template switches a project's bridge reads, each with its own
 * revision: after a `templatePreferences/change`, for a `templatePreferences/read`,
 * in `templatePreferences/didChange` and in `session/register`.
 */
internal class TemplatePreferencesResult(
    val project: TemplatePreferenceSnapshot,
    val allProjects: TemplatePreferenceSnapshot,
) : RpcResult {
    companion object {
        fun of(project: Project): TemplatePreferencesResult =
            TemplatePreferencesResult(
                ProjectTemplatePreferenceStore.getInstance(project).snapshot(),
                TemplatePreferenceStore.getInstance().snapshot(),
            )
    }
}
