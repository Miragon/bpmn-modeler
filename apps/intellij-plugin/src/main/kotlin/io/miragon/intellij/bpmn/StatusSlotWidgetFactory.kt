package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory

/**
 * Registers the [StatusSlotWidget] of one slot per project. Always available; the
 * widget stays hidden until the core shows its slot. plugin.xml registers one
 * subclass per slot under the id [widgetIdFor] gives it.
 */
abstract class StatusSlotWidgetFactory(
    private val slot: StatusSlot,
    private val displayName: String,
) : StatusBarWidgetFactory {
    override fun getId(): String = widgetIdFor(slot)

    override fun getDisplayName(): String = displayName

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = StatusSlotWidget(id) { runStatusAction(project, it) }

    override fun disposeWidget(widget: StatusBarWidget) = Disposer.dispose(widget)

    override fun canBeEnabledOn(statusBar: StatusBar): Boolean = true
}

class ElementTemplatesStatusBarWidgetFactory :
    StatusSlotWidgetFactory(StatusSlot.ELEMENT_TEMPLATES, "Miragon BPMN Modeler — Element Templates")

class EngineStatusBarWidgetFactory :
    StatusSlotWidgetFactory(StatusSlot.ENGINE_VERSION, "Miragon BPMN Modeler — Engine Version")

class BpmnlintStatusBarWidgetFactory :
    StatusSlotWidgetFactory(StatusSlot.BPMNLINT, "Miragon BPMN Modeler — BPMNlint")

class DeploymentTargetStatusBarWidgetFactory :
    StatusSlotWidgetFactory(StatusSlot.DEPLOYMENT_TARGET, "Miragon BPMN Modeler — Deployment Target")
