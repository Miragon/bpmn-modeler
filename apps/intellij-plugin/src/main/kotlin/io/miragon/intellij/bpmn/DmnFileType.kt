package io.miragon.intellij.bpmn

import com.intellij.lang.xml.XMLLanguage
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/**
 * Registers `.dmn` as a first-class XML-derived file type — the DMN twin of
 * [BpmnFileType]. The two reasons a real `FileType` is needed rather than just
 * [DmnFileEditorProvider.accept] are identical to BPMN's: the Marketplace Feature
 * Extractor only reads the static `extensions` attribute to offer the
 * "Plugins supporting *.dmn files found" banner, and basing the type on
 * `XMLLanguage` keeps the secondary plain-text tab (the JCEF editor opens with
 * `PLACE_BEFORE_DEFAULT_EDITOR`) lexing/folding the round-tripped XML.
 */
object DmnFileType : LanguageFileType(XMLLanguage.INSTANCE) {
    override fun getName(): String = "DMN"

    override fun getDescription(): String = "DMN 1.3 decision model"

    override fun getDefaultExtension(): String = "dmn"

    // A dedicated 16×16 decision-table glyph, not the marketplace badge, for the
    // same downscaling reason documented on BpmnFileType; IconLoader substitutes
    // the sibling `dmn_dark.svg` under dark themes.
    override fun getIcon(): Icon =
        IconLoader.getIcon("/icons/dmn.svg", DmnFileType::class.java)
}
