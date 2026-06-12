package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import io.miragon.intellij.bpmn.HostNotifications

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
 * @param parentDisposable The `CoreProcess` service — parent for the script
 *   editor manager's listeners.
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
)
