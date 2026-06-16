package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.ScriptCompletionModel
import io.miragon.intellij.bpmn.ScriptEditorManager
import io.miragon.intellij.bpmn.VariableInfo

/**
 * Routes the inline "Edit Script" feature. The host is a dumb surface keyed by
 * opaque `scriptId`: it opens a script as an editor tab and streams keystrokes
 * back as `script/didChange`, a user-initiated tab close as `script/didClose`.
 *
 * The [ScriptEditorManager] is lazy so opening a `.bpmn` file that never edits a
 * script touches no editor-manager machinery; it parents to the `CoreProcess`
 * service so its listeners die with the project.
 */
internal class ScriptRouter(private val deps: BridgeDeps) {
    private val scriptEditors by lazy {
        ScriptEditorManager(
            deps.project,
            deps.parentDisposable,
            onChange = { scriptId, content ->
                deps.channel.notify("script/didChange", linkedMapOf("scriptId" to scriptId, "content" to content))
            },
            onUserClose = { scriptId ->
                deps.channel.notify("script/didClose", linkedMapOf("scriptId" to scriptId))
            },
        )
    }

    fun register() {
        deps.handlers
            // `completion` is optional and carries the kind-scoped catalog the
            // bridge already resolved; fromJson tolerates a missing/null member.
            .on("script/open") { params, _ ->
                scriptEditors.openScript(
                    params.get("scriptId").asString,
                    params.get("fileName").asString,
                    params.get("content").asString,
                    deps.gson.fromJson(params.get("completion"), ScriptCompletionModel::class.java),
                )
            }
            .on("script/close") { params, _ -> scriptEditors.closeScript(params.get("scriptId").asString) }
            // Live variable model push: swap the script tab's completion catalog
            // so the next completion invocation sees the current variables.
            .on("script/updateVariables") { params, _ ->
                scriptEditors.updateVariables(
                    params.get("scriptId").asString,
                    deps.gson.fromJson(
                        params.get("variables"),
                        Array<VariableInfo>::class.java,
                    ).orEmpty().toList(),
                )
            }
    }
}
