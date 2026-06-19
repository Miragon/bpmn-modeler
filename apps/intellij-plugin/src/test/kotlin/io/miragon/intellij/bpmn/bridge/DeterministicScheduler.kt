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
 * Only the two methods the supervisor calls are implemented; the rest of the
 * interface throws, so an unexpected new dependency on the scheduler is loud
 * rather than silently mis-tested.
 */
internal class DeterministicScheduler : ScheduledExecutorService {
    private data class Pending(val task: Runnable, val delayMillis: Long)

    private val pending = ArrayDeque<Pending>()

    /** Every delay handed to [schedule], in order — never drained, so tests can assert the full curve. */
    val recordedDelays = mutableListOf<Long>()

    override fun execute(command: Runnable) = command.run()

    override fun schedule(command: Runnable, delay: Long, unit: TimeUnit): ScheduledFuture<*> {
        val millis = unit.toMillis(delay)
        recordedDelays += millis
        pending.addLast(Pending(command, millis))
        return NoopScheduledFuture
    }

    /**
     * Fires every currently-pending task in FIFO order. Tasks are drained before
     * running so a task that schedules another (a respawn that crashes again)
     * queues for the *next* [runPending] rather than looping here.
     */
    fun runPending() {
        val due = pending.toList()
        pending.clear()
        due.forEach { it.task.run() }
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

/** The supervisor ignores the returned handle, so a do-nothing future suffices. */
private object NoopScheduledFuture : ScheduledFuture<Any?> {
    override fun getDelay(unit: TimeUnit): Long = 0

    override fun compareTo(other: Delayed): Int = 0

    override fun cancel(mayInterruptIfRunning: Boolean): Boolean = false

    override fun isCancelled(): Boolean = false

    override fun isDone(): Boolean = true

    override fun get(): Any? = null

    override fun get(timeout: Long, unit: TimeUnit): Any? = null
}
