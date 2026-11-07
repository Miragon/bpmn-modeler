package io.miragon.intellij.bpmn

import java.io.IOException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path

/** Finds the cached file a [WebviewRoute.PluginAsset] names, refusing links and anything outside the cache root. */
internal object PluginAssetFile {
    fun resolve(root: Path, asset: WebviewRoute.PluginAsset): Path? {
        val file = root.resolve(asset.hash).resolve(asset.fileName)
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) return null
        return try {
            file.takeIf { it.toRealPath().startsWith(root.toRealPath()) }
        } catch (_: IOException) {
            null
        }
    }
}
