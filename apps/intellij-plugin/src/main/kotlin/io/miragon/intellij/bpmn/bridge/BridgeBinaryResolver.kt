package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * Resolves a runnable bridge binary and caches it for the resolver's lifetime.
 * Pure file I/O with no concurrency of its own (the one cross-window race is the
 * atomic-move in [extractBridge]).
 */
internal class BridgeBinaryResolver {
    private val log = Logger.getInstance(BridgeBinaryResolver::class.java)

    @Volatile
    private var cachedBinary: Path? = null

    /**
     * Returns the path to a runnable bridge binary: a dev override if set, else
     * the bundled per-platform binary extracted to a stable, version-keyed cache
     * under the IDE system dir, made executable, and cached for this resolver's
     * lifetime.
     *
     * The stable path is load-bearing on Windows. Extracting to a brand-new
     * `%TEMP%` file every session (the old behaviour) defeats Defender's scan
     * cache: launching a never-before-seen executable triggers a synchronous
     * on-execution scan *inside* `CreateProcess` that can freeze the caller for
     * seconds. Keying the path by plugin version means Defender re-scans only on
     * the first launch after an install/upgrade, then reuses its verdict.
     */
    fun resolve(): Path {
        (System.getProperty("miragon.bridge") ?: System.getenv("MIRAGON_BRIDGE"))?.let {
            return Path.of(it)
        }
        cachedBinary?.let { return it }

        val platform = platformDir()
        // Windows refuses to launch an executable without the `.exe` suffix. Bun's
        // `--target=bun-windows-x64` produces `modeler-bridge.exe` and Gradle
        // stages it under the same name, so we mirror that here.
        val isWindows = platform.startsWith("windows")
        val binaryName = if (isWindows) "$BRIDGE_BINARY_NAME.exe" else BRIDGE_BINARY_NAME
        val resource = "/bin/$platform/$binaryName"

        val cacheDir = Path.of(PathManager.getSystemPath(), CACHE_SUBDIR, bridgeCacheKey())
        val target = cacheDir.resolve(binaryName)
        if (!Files.isRegularFile(target)) {
            extractBridge(resource, cacheDir, target)
            pruneStaleCaches(cacheDir)
        }
        // Re-assert the exec bit cheaply in case a prior session extracted the file
        // but failed to set it (or the bit was cleared out from under us).
        target.toFile().setExecutable(true, true)
        cachedBinary = target
        return target
    }

    /**
     * Materialises the bundled bridge at [target] atomically: extraction goes to a
     * sibling temp file, then an atomic move into place, so a crash mid-copy never
     * leaves a truncated binary that would fail to launch. Two IDE windows (each
     * with its own project-level service) can race here; the loser's move fails
     * with [FileAlreadyExistsException] and simply reuses the winner's file.
     */
    private fun extractBridge(resource: String, cacheDir: Path, target: Path) {
        val stream =
            javaClass.getResourceAsStream(resource)
                ?: error(
                    "No bundled modeler bridge ($resource). " +
                        "Build it with `corepack yarn workspace @miragon/bpmn-modeler-bridge compile`.",
                )
        Files.createDirectories(cacheDir)
        val temp = Files.createTempFile(cacheDir, BRIDGE_BINARY_NAME, ".tmp")
        try {
            stream.use { Files.copy(it, temp, StandardCopyOption.REPLACE_EXISTING) }
            temp.toFile().setExecutable(true, true)
            try {
                Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE)
            } catch (e: FileAlreadyExistsException) {
                // Another IDE window extracted it first; its copy is authoritative.
                log.debug("Bridge already extracted by a concurrent window: ${e.message}")
            }
        } finally {
            Files.deleteIfExists(temp)
        }
    }

    /**
     * Cache-directory segment that changes whenever the shipped binary might
     * differ. Keyed by plugin version so an upgrade re-extracts (and Defender
     * re-scans once); falls back to `"dev"` when the version is unavailable — fine
     * because dev runs use the `MIRAGON_BRIDGE` override checked above.
     *
     * Read from a build-stamped class-path resource rather than a PluginManager
     * lookup: every API that maps a class or id back to its descriptor
     * (`getPluginByClass`, `PluginManagerCore.getPlugin`) is `@ApiStatus.Internal`
     * and would fail JetBrains Marketplace verification.
     */
    private fun bridgeCacheKey(): String =
        javaClass.getResourceAsStream("/bridge-version.txt")
            ?.bufferedReader()?.use { it.readText().trim() }
            ?.ifEmpty { null } ?: "dev"

    /**
     * Best-effort removal of *other* version dirs so extracted binaries don't
     * accumulate (~tens of MB each) across plugin upgrades. Runs only right after a
     * fresh extraction — i.e. once per new version. Deleting a binary another IDE
     * window (running an older plugin version) is currently executing is safe:
     * POSIX keeps the running inode alive after unlink, and Windows locks the file
     * so the delete simply fails and is retried on the next upgrade. Hence all
     * failures are swallowed.
     */
    private fun pruneStaleCaches(currentVersionDir: Path) {
        val root = currentVersionDir.parent ?: return
        runCatching {
            Files.list(root).use { entries ->
                entries
                    .filter { Files.isDirectory(it) && it != currentVersionDir }
                    .forEach { stale ->
                        runCatching {
                            Files.walk(stale).use { paths ->
                                // Deepest-first so directories are emptied before removal.
                                paths.sorted(Comparator.reverseOrder()).forEach { Files.deleteIfExists(it) }
                            }
                        }
                    }
            }
        }
    }

    private fun platformDir(): String {
        val os = System.getProperty("os.name").lowercase()
        val arch = System.getProperty("os.arch").lowercase()
        val osPart =
            when {
                os.contains("mac") || os.contains("darwin") -> "darwin"
                os.contains("win") -> "windows"
                else -> "linux"
            }
        val archPart = if (arch.contains("aarch64") || arch.contains("arm")) "arm64" else "x64"
        return "$osPart-$archPart"
    }

    private companion object {
        const val BRIDGE_BINARY_NAME = "modeler-bridge"

        // Version-keyed extraction root under PathManager.getSystemPath(); the
        // version segment is appended per [bridgeCacheKey].
        const val CACHE_SUBDIR = "miragon-bpmn-modeler/bridge"
    }
}
