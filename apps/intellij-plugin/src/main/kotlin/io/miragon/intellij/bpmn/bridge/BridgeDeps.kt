package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.AppExecutorUtil
import io.miragon.intellij.bpmn.HostNotifications
import java.util.concurrent.Executor

/**
 * Shared dependency bundle handed to every feature router (mirrors the TS
 * `sharedDeps.ts`). Bundling these lets each router declare a single
 * constructor parameter and keeps `CoreProcess` wiring to one object.
 *
 * @param channel Outbound transport (notify/reply) the routers send through.
 * @param handlers Registry each router populates in its `register()`.
 * @param gson The channel's single Gson instance, reused for (de)serialisation.
 * @param isProcessAlive Liveness gate for no-op-when-down sends.
 * @param ensureStartedAsync Off-EDT spawn trigger for first-frame senders.
 * @param parentDisposable The `CoreProcess` service — parent for the routers'
 *   message-bus subscriptions (the save flush, the script editor manager's listeners).
 * @param notifications Lazy host UI surface; constructed on first error/notifier.
 */
internal class BridgeDeps(
    val project: Project,
    val channel: RpcChannel,
    val handlers: RpcHandlerRegistry,
    val gson: Gson,
    val isProcessAlive: () -> Boolean,
    val ensureStartedAsync: () -> Unit,
    val parentDisposable: Disposable,
    val notifications: Lazy<HostNotifications>,
) {
    // A PasswordSafe read can wait for an OS keychain prompt, so it must hold
    // neither the EDT nor the frames behind it on the reader thread. One thread
    // keeps a save ahead of the read that follows it.
    private val credentialStoreExecutor: Executor =
        AppExecutorUtil.createBoundedApplicationPoolExecutor("modeler-credential-store", 1)

    /** The [RpcAction] for a request whose [work] calls PasswordSafe. */
    fun credentialStoreAction(method: String, work: () -> RpcResult?): RpcAction =
        RpcAction { requestId -> channel.replyFrom(credentialStoreExecutor, requestId, method, work) }
}
