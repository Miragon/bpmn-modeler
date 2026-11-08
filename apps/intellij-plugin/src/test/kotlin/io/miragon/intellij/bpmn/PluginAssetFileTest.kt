package io.miragon.intellij.bpmn

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class PluginAssetFileTest {
    @TempDir
    lateinit var tempDir: Path

    private val root: Path get() = tempDir.resolve("bpmn-plugins")

    private fun cachedFile(hash: String = HASH, fileName: String = "plugin.js"): Path {
        val file = root.resolve(hash).resolve(fileName)
        Files.createDirectories(file.parent)
        Files.writeString(file, "console.log('plugin');")
        return file
    }

    @Test
    fun `resolves a cached plugin file below the cache root`() {
        val file = cachedFile()

        assertEquals(file, PluginAssetFile.resolve(root, WebviewRoute.PluginAsset(HASH, "plugin.js")))
    }

    @Test
    fun `resolves nothing for a file the cache does not hold`() {
        cachedFile(fileName = "plugin.js")

        assertNull(PluginAssetFile.resolve(root, WebviewRoute.PluginAsset(HASH, "plugin.css")))
    }

    @Test
    fun `resolves nothing while the cache root does not exist`() {
        assertNull(PluginAssetFile.resolve(root, WebviewRoute.PluginAsset(HASH, "plugin.js")))
    }

    @Test
    fun `resolves nothing for a directory named like a plugin file`() {
        Files.createDirectories(root.resolve(HASH).resolve("plugin.js"))

        assertNull(PluginAssetFile.resolve(root, WebviewRoute.PluginAsset(HASH, "plugin.js")))
    }

    @Test
    fun `resolves nothing for a plugin file that is a symbolic link`() {
        val target = cachedFile(hash = OTHER_HASH)
        Files.createDirectories(root.resolve(HASH))
        Files.createSymbolicLink(root.resolve(HASH).resolve("plugin.js"), target)

        assertNull(PluginAssetFile.resolve(root, WebviewRoute.PluginAsset(HASH, "plugin.js")))
    }

    @Test
    fun `resolves nothing for a hash folder linked outside the cache root`() {
        val outside = tempDir.resolve("outside")
        Files.createDirectories(outside)
        Files.writeString(outside.resolve("plugin.js"), "steal()")
        Files.createDirectories(root)
        Files.createSymbolicLink(root.resolve(HASH), outside)

        assertNull(PluginAssetFile.resolve(root, WebviewRoute.PluginAsset(HASH, "plugin.js")))
    }

    private companion object {
        const val HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        const val OTHER_HASH = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    }
}
