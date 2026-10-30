package io.miragon.intellij.bpmn

import com.google.gson.JsonParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class ModelerLocalesTest {
    @Test
    fun `offers the languages and labels of the VS Code language setting, in its order`() {
        assertEquals(
            manifestLanguages(),
            ModelerLocales.CODES.map { code -> code to ModelerLocales.LABELS[code] },
        )
    }

    /** `manifest.contract.spec.ts` pins these pairs to the shipped language catalogue. */
    private fun manifestLanguages(): List<Pair<String, String>> {
        val path =
            requireNotNull(System.getProperty("miragon.vscodeManifest")) {
                "miragon.vscodeManifest is unset; run the test through Gradle"
            }
        val language =
            JsonParser.parseString(Files.readString(Path.of(path))).asJsonObject
                .getAsJsonObject("contributes")
                .getAsJsonObject("configuration")
                .getAsJsonObject("properties")
                .getAsJsonObject("miragon.bpmnModeler.language")
        val codes = language.getAsJsonArray("enum").map { it.asString }
        val labels = language.getAsJsonArray("enumItemLabels").map { it.asString }
        return codes.zip(labels)
    }
}
