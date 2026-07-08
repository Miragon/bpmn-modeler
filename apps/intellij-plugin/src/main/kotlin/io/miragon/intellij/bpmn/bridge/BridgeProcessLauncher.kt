package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.application.PathManager

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
 *
 * The marketplace template cache root rides in on an env var. It lives under
 * [PathManager.getSystemPath] (an IDE-managed, per-machine location) but is
 * segmented by [projectKey] so each project gets its own cache. A prune therefore
 * only ever evicts the current project's slots — a marketplace registered only in
 * another project (marketplaces can be project-scoped) is never deleted by an
 * Update/Remove here. Windows on the *same* project still share one cache;
 * concurrent updates worst-case overwrite the same deterministic per-file paths,
 * which the core's per-file JSON-parse guard tolerates, so no locking is needed.
 *
 * @param projectKey Stable per-project cache segment ([Project.getLocationHash]).
 */
internal class DefaultBridgeProcessLauncher(
    private val projectKey: String,
    private val binaryResolver: BridgeBinaryResolver = BridgeBinaryResolver(),
) : BridgeProcessLauncher {
    override fun launch(): Process {
        val binary = binaryResolver.resolve()
        val builder = ProcessBuilder(binary.toString()).redirectErrorStream(false)
        builder.environment()[MARKETPLACE_CACHE_ENV] =
            "${PathManager.getSystemPath()}/miragon-bpmn-modeler/marketplaces/$projectKey"
        return builder.start()
    }

    private companion object {
        // Read by the bridge's `server.ts`; keep the name in sync there.
        const val MARKETPLACE_CACHE_ENV = "MIRAGON_BPMN_MARKETPLACE_CACHE"
    }
}
