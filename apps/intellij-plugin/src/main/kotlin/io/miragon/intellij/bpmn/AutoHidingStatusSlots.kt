package io.miragon.intellij.bpmn

import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** As long as VS Code shows a transient view, so both hosts hide it alike. */
private const val TRANSIENT_VIEW_VISIBLE_MS = 3000L

/**
 * Hides a transient view after [TRANSIENT_VIEW_VISIBLE_MS]. A later show or hide
 * of the slot cancels that, so an old timer never hides what came after it.
 */
internal class AutoHidingStatusSlots(
    private val slots: StatusSlots,
    private val scheduler: ScheduledExecutorService,
) : StatusSlots {
    private inner class AutoHide(val slot: StatusSlot) : Runnable {
        var timer: ScheduledFuture<*>? = null

        // A timer that already fired is past cancelling, so it checks it is still the slot's own.
        override fun run() =
            synchronized(this@AutoHidingStatusSlots) {
                if (pendingAutoHides[slot] === this) hide(slot)
            }
    }

    private val pendingAutoHides = HashMap<StatusSlot, AutoHide>()

    @Synchronized
    override fun show(slot: StatusSlot, view: StatusView) {
        cancelPendingAutoHide(slot)
        slots.show(slot, view)
        if (view.transient) {
            val autoHide = AutoHide(slot)
            pendingAutoHides[slot] = autoHide
            autoHide.timer = scheduler.schedule(autoHide, TRANSIENT_VIEW_VISIBLE_MS, TimeUnit.MILLISECONDS)
        }
    }

    @Synchronized
    override fun hide(slot: StatusSlot) {
        cancelPendingAutoHide(slot)
        slots.hide(slot)
    }

    private fun cancelPendingAutoHide(slot: StatusSlot) {
        pendingAutoHides.remove(slot)?.timer?.cancel(false)
    }
}
