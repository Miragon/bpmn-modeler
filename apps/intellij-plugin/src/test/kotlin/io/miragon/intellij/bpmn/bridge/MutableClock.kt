package io.miragon.intellij.bpmn.bridge

/**
 * A settable wall-clock source (`() -> Long`) so supervisor tests cross the
 * stable-run boundary by [advance]-ing time instead of sleeping.
 */
internal class MutableClock(private var nowMillis: Long = 0L) : () -> Long {
    override fun invoke(): Long = nowMillis

    fun advance(millis: Long) {
        nowMillis += millis
    }

    fun set(millis: Long) {
        nowMillis = millis
    }
}
