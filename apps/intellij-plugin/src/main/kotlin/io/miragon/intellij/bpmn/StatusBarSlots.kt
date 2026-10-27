package io.miragon.intellij.bpmn

import com.intellij.openapi.project.Project

internal fun widgetIdFor(@Suppress("UNUSED_PARAMETER") slot: StatusSlot): String = ""

internal class StatusBarSlots(@Suppress("unused") private val project: Project) : StatusSlots {
    override fun show(slot: StatusSlot, view: StatusView) = Unit

    override fun hide(slot: StatusSlot) = Unit
}
