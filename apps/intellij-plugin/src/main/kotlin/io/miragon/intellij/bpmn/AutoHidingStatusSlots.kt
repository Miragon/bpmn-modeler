package io.miragon.intellij.bpmn

import java.util.concurrent.ScheduledExecutorService

internal class AutoHidingStatusSlots(
    private val slots: StatusSlots,
    @Suppress("unused") private val scheduler: ScheduledExecutorService,
) : StatusSlots {
    override fun show(slot: StatusSlot, view: StatusView) = slots.show(slot, view)

    override fun hide(slot: StatusSlot) = slots.hide(slot)
}
