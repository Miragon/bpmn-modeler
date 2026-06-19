package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.diagnostic.Logger
import org.junit.jupiter.api.extension.BeforeAllCallback
import org.junit.jupiter.api.extension.ExtensionContext
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Installs a no-op [Logger] factory before any platform [Logger.getInstance]
 * call fires. Without a real IDE, the default factory yields a `DefaultLogger`
 * whose `error(...)` *throws* — which would abort the give-up and spawn-failure
 * tests at the very line they mean to exercise. A no-op logger lets those paths
 * run to their observable effect (or lack of one).
 *
 * Registered via `@ExtendWith(TestLoggerSetup::class)` on the suites that touch
 * production code holding a `Logger`.
 */
class TestLoggerSetup : BeforeAllCallback {
    override fun beforeAll(context: ExtensionContext) = install()

    companion object {
        private val installed = AtomicBoolean(false)

        /** Idempotent: the factory is process-global, so install it at most once. */
        fun install() {
            if (installed.compareAndSet(false, true)) {
                Logger.setFactory { NoopLogger() }
            }
        }
    }
}

/** Swallows every level so production logging is inert under test. */
private class NoopLogger : Logger() {
    override fun isDebugEnabled(): Boolean = false

    override fun debug(message: String?, t: Throwable?) = Unit

    override fun info(message: String?, t: Throwable?) = Unit

    override fun warn(message: String?, t: Throwable?) = Unit

    override fun error(message: String?, t: Throwable?, vararg details: String) = Unit
}
