package io.miragon.intellij.bpmn.bridge

import com.google.gson.JsonParser
import com.intellij.credentialStore.CredentialAttributes
import com.intellij.credentialStore.CredentialStore
import com.intellij.credentialStore.Credentials
import com.intellij.ide.passwordSafe.PasswordSafe
import com.intellij.ide.passwordSafe.impl.BasePasswordSafe
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Serves PasswordSafe from [store] instead of the test application's own store until [close]. */
internal class ReplacedPasswordSafeStore(store: CredentialStore) : AutoCloseable {
    private val passwordSafe = PasswordSafe.instance as BasePasswordSafe
    private val originalStore = passwordSafe.currentProvider

    init {
        passwordSafe.currentProvider = store
    }

    override fun close() {
        passwordSafe.currentProvider = originalStore
    }
}

/**
 * Stands in for an OS keychain that holds every PasswordSafe read until the user
 * answers its access prompt, as macOS does after an IDE update. Writes return at
 * once because the platform queues them. [close] answers the prompt and puts the
 * test application's own store back.
 */
internal class KeychainAwaitingPrompt : AutoCloseable {
    private val readStarted = CountDownLatch(1)
    private val promptAnswered = CountDownLatch(1)
    private val replacedStore =
        ReplacedPasswordSafeStore(
            object : CredentialStore {
                override fun get(attributes: CredentialAttributes): Credentials? {
                    readStarted.countDown()
                    promptAnswered.await(PROMPT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    return null
                }

                override fun set(attributes: CredentialAttributes, credentials: Credentials?) = Unit
            },
        )

    fun awaitReadReachingKeychain() =
        assertTrue(readStarted.await(WAIT_SECONDS, TimeUnit.SECONDS), "the read must reach PasswordSafe")

    fun answerPrompt() = promptAnswered.countDown()

    override fun close() {
        answerPrompt()
        replacedStore.close()
    }

    private companion object {
        const val WAIT_SECONDS = 2L
        const val PROMPT_TIMEOUT_SECONDS = 10L
    }
}

/**
 * Sends [readRequest] through [wired]'s reader pump while the keychain holds it,
 * then a frame of another method, and asserts the host dispatches that frame
 * before the prompt is answered, and still answers the read afterwards.
 */
internal fun assertNextFrameIsDispatchedWhileReadWaitsForKeychain(
    wired: WiredBridge,
    readRequest: String,
    readRequestId: Int,
) {
    val nextFrameDispatched = CountDownLatch(1)
    wired.handlers.on("probe/next") { RpcAction { nextFrameDispatched.countDown() } }

    KeychainAwaitingPrompt().use { keychain ->
        wired.fake.emit(readRequest)
        keychain.awaitReadReachingKeychain()
        wired.fake.emit("""{"method":"probe/next","params":{}}""")

        assertTrue(
            nextFrameDispatched.await(2, TimeUnit.SECONDS),
            "a PasswordSafe read waiting for the user must not hold the frame behind it",
        )
        keychain.answerPrompt()
        val reply = JsonParser.parseString(wired.fake.nextFrame()).asJsonObject
        assertEquals(readRequestId, reply.get("id").asInt, "the read still answers once PasswordSafe returns")
    }
}
