package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.project.Project

/**
 * Routes the add-ons view of the BPMN Modeler tool window's Artifacts tab:
 * the core asks it to show the tab, and the core then delivers the rows to
 * the page itself.
 */
internal class AddOnsRouter(
    private val deps: BridgeDeps,
    // Opens the tab on the EDT and reports whether it is shown; a headless test cannot show a tool window.
    private val revealArtifacts: (Project, (Boolean) -> Unit) -> Unit = { _, onDone -> onDone(false) },
) {
    fun register() {
        deps.handlers.on("addOns/reveal") {
            RpcAction { id ->
                id?.let { requestId ->
                    deps.channel.replyLaterFromEdt(requestId, "addOns/reveal") { reply ->
                        revealArtifacts(deps.project) { shown -> reply.result(AddOnsRevealResult(shown)) }
                    }
                }
            }
        }
    }
}
