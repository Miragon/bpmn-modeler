package io.miragon.intellij.bpmn.bridge

import java.util.concurrent.Callable
import java.util.concurrent.Delayed
import java.util.concurrent.Future
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * A hand-rolled [ScheduledExecutorService] that turns the supervisor's backoff
 * scheduling into something tests can inspect and step. [schedule] records the
 * requested delay (so tests assert the `500ms × attempt` curve) and parks the
 * task until [runPending] fires it — making restart/give-up assertions instant
 * and free of wall-clock waits. [execute] runs inline, since the supervisor only
 * uses it to hop the spawn off the EDT, which is irrelevant under test.
 *
 * Cancellation is modelled: the returned handle removes its task from the queue,
 * so [runPending] skips it — needed by the editor router's debounce, where a newer
 * frame cancels and reschedules the previous timer (only the last must fire).
 *
 * Only the methods the code under test calls are implemented; the rest of the
 * interface throws, so an unexpected new dependency on the scheduler is loud
 * rather than silently mis-tested.
 */
internal class DeterministicScheduler : ScheduledExecutorService {
    private class Pending(val task: Runnable) {
        @Volatile
        var cancelled = false
    }

    private val pending = ArrayDeque<Pending>()

    /** Every delay handed to [schedule], in order — never drained, so tests can assert the full curve. */
    val recordedDelays = mutableListOf<Long>()

    override fun execute(command: Runnable) = command.run()

    override fun schedule(command: Runnable, delay: Long, unit: TimeUnit): ScheduledFuture<*> {
        recordedDelays += unit.toMillis(delay)
        val entry = Pending(command)
        pending.addLast(entry)
        return CancellableScheduledFuture {
            entry.cancelled = true
            pending.remove(entry)
        }
    }

    /**
     * Fires every currently-pending, non-cancelled task in FIFO order. Tasks are
     * drained before running so a task that schedules another (a respawn that
     * crashes again) queues for the *next* [runPending] rather than looping here.
     */
    fun runPending() {
        val due = pending.toList()
        pending.clear()
        due.forEach { if (!it.cancelled) it.task.run() }
    }

    // ── unused surface ──────────────────────────────────────────────────────────

    override fun <V : Any?> schedule(callable: Callable<V>, delay: Long, unit: TimeUnit): ScheduledFuture<V> = unsupported()

    override fun scheduleAtFixedRate(command: Runnable, initialDelay: Long, period: Long, unit: TimeUnit): ScheduledFuture<*> =
        unsupported()

    override fun scheduleWithFixedDelay(command: Runnable, initialDelay: Long, delay: Long, unit: TimeUnit): ScheduledFuture<*> =
        unsupported()

    override fun shutdown() = unsupported()

    override fun shutdownNow(): MutableList<Runnable> = unsupported()

    override fun isShutdown(): Boolean = unsupported()

    override fun isTerminated(): Boolean = unsupported()

    override fun awaitTermination(timeout: Long, unit: TimeUnit): Boolean = unsupported()

    override fun <T : Any?> submit(task: Callable<T>): Future<T> = unsupported()

    override fun <T : Any?> submit(task: Runnable, result: T): Future<T> = unsupported()

    override fun submit(task: Runnable): Future<*> = unsupported()

    override fun <T : Any?> invokeAll(tasks: MutableCollection<out Callable<T>>): MutableList<Future<T>> = unsupported()

    override fun <T : Any?> invokeAll(
        tasks: MutableCollection<out Callable<T>>,
        timeout: Long,
        unit: TimeUnit,
    ): MutableList<Future<T>> = unsupported()

    override fun <T : Any?> invokeAny(tasks: MutableCollection<out Callable<T>>): T = unsupported()

    override fun <T : Any?> invokeAny(tasks: MutableCollection<out Callable<T>>, timeout: Long, unit: TimeUnit): T = unsupported()

    private fun unsupported(): Nothing = throw UnsupportedOperationException("DeterministicScheduler: not needed by the code under test")
}

/**
 * A handle whose [cancel] marks its parked task cancelled and unlinks it from the
 * scheduler's queue (via the [onCancel] closure), so a later
 * [DeterministicScheduler.runPending] skips it. The supervisor ignores the handle
 * entirely; the editor router's debounce relies on it to drop superseded timers.
 */
private class CancellableScheduledFuture(private val onCancel: () -> Unit) : ScheduledFuture<Any?> {
    private var cancelled = false

    override fun cancel(mayInterruptIfRunning: Boolean): Boolean {
        if (cancelled) return false
        cancelled = true
        onCancel()
        return true
    }

    override fun getDelay(unit: TimeUnit): Long = 0

    override fun compareTo(other: Delayed): Int = 0

    override fun isCancelled(): Boolean = cancelled

    override fun isDone(): Boolean = cancelled

    override fun get(): Any? = null

    override fun get(timeout: Long, unit: TimeUnit): Any? = null
}
