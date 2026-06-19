package io.miragon.intellij.bpmn.bridge

/**
 * Creates the bridge subprocess. Extracted from [ProcessSupervisor] so the
 * supervisor's concurrency logic can be unit-tested against a scripted fake
 * process instead of a real Bun binary, and so binary resolution + process
 * construction live in one place (SRP) rather than inline in the supervisor.
 */
internal fun interface BridgeProcessLauncher {
    fun launch(): Process
}

/**
 * Production launcher: resolves the bundled per-platform bridge binary and
 * starts it. [redirectErrorStream] is `false` because stdout is reserved for the
 * RPC framing and stderr is the core's separate diagnostic channel.
 */
internal class DefaultBridgeProcessLauncher(
    private val binaryResolver: BridgeBinaryResolver = BridgeBinaryResolver(),
) : BridgeProcessLauncher {
    override fun launch(): Process {
        val binary = binaryResolver.resolve()
        return ProcessBuilder(binary.toString()).redirectErrorStream(false).start()
    }
}
