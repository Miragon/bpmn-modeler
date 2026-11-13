package io.miragon.intellij.bpmn.bridge

import io.miragon.intellij.bpmn.ElementIdReviewActions
import io.miragon.intellij.bpmn.ElementIdReviewView
import io.miragon.intellij.bpmn.ElementIdReviewWindow
import io.miragon.intellij.bpmn.ToolWindowElementIdReview

/**
 * Routes the element ID review the core shows in the Element IDs tool window:
 * `elementIdReview/show` and `elementIdReview/close` from the core, and the
 * window's checkboxes, selected rows, Apply and Discard back to it.
 */
internal class ElementIdReviewRouter(
    private val deps: BridgeDeps,
    private val window: ElementIdReviewWindow = ToolWindowElementIdReview(deps.project),
) : ElementIdReviewActions {
    fun register() {
        deps.handlers
            .on("elementIdReview/show") { params ->
                val view = ElementIdReviewView.from(params.jsonObject("view"))
                RpcAction { window.show(view) }
            }
            .on("elementIdReview/close") { RpcAction { window.close() } }
    }

    override fun setChecked(ids: List<String>, checked: Boolean) =
        send(HostToCoreMethod.ELEMENT_ID_REVIEW_SET_CHECKED, linkedMapOf("ids" to ids, "checked" to checked))

    override fun apply() = send(HostToCoreMethod.ELEMENT_ID_REVIEW_APPLY, linkedMapOf())

    override fun discard() = send(HostToCoreMethod.ELEMENT_ID_REVIEW_DISCARD, linkedMapOf())

    override fun reveal(elementId: String) = send(HostToCoreMethod.ELEMENT_ID_REVIEW_REVEAL, linkedMapOf("elementId" to elementId))

    private fun send(method: HostToCoreMethod, params: Map<String, Any>) {
        deps.channel.notify(method, params)
        deps.ensureStartedAsync()
    }
}
