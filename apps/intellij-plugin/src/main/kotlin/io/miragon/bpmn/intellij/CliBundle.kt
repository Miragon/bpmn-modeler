package io.miragon.bpmn.intellij

import com.intellij.openapi.diagnostic.logger
import java.net.URI
import java.nio.file.FileSystems
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.nio.file.StandardCopyOption

/**
 * Resolves the path to the bundled `bpmn-modeler` CLI entry (`index.js`).
 *
 * The CLI's built output (the whole `apps/modeler-cli/dist/` tree including
 * the copied webview bundles) is shipped inside the plugin JAR under
 * `resources/cli/`. On first use we extract it to a temp directory so
 * `node` can read it from disk; subsequent calls return the cached path.
 */
object CliBundle {
    private val LOG = logger<CliBundle>()

    @Volatile private var cached: Path? = null

    @Synchronized
    fun resolve(): Path {
        cached?.let { return it }

        val version = javaClass.`package`?.implementationVersion ?: "dev"
        val target = Paths.get(System.getProperty("java.io.tmpdir"))
            .resolve("miragon-bpmn-cli-$version")
        extractIfNeeded(target)

        val entry = target.resolve("index.js")
        check(Files.exists(entry)) { "Extracted CLI is missing index.js at $entry" }
        cached = entry
        return entry
    }

    private fun extractIfNeeded(target: Path) {
        val marker = target.resolve(".extracted")
        if (Files.exists(marker)) return

        LOG.info("Extracting bundled bpmn-modeler CLI to $target")
        Files.createDirectories(target)

        val resource = javaClass.classLoader.getResource("cli")
            ?: error("Bundled CLI resources not found on classpath (expected 'cli/')")

        when (resource.protocol) {
            "jar" -> extractFromJar(resource.toURI(), target)
            "file" -> copyTree(Paths.get(resource.toURI()), target)
            else -> error("Unsupported resource protocol: ${resource.protocol}")
        }

        Files.createFile(marker)
    }

    private fun extractFromJar(uri: URI, target: Path) {
        FileSystems.newFileSystem(uri, emptyMap<String, Any>()).use { fs ->
            val root = fs.getPath("/cli")
            copyTree(root, target)
        }
    }

    private fun copyTree(source: Path, target: Path) {
        Files.walk(source).use { stream ->
            for (path in stream) {
                val rel = source.relativize(path).toString()
                if (rel.isEmpty()) continue
                val dest = target.resolve(rel)
                if (Files.isDirectory(path)) {
                    Files.createDirectories(dest)
                } else {
                    Files.createDirectories(dest.parent)
                    Files.copy(path, dest, StandardCopyOption.REPLACE_EXISTING)
                }
            }
        }
    }
}
