package io.miragon.intellij.bpmn

import com.intellij.lang.xml.XMLLanguage
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

/**
 * Registers `.bpmn` as a first-class XML-derived file type.
 *
 * Two reasons this needs to be a real `FileType` rather than just the existing
 * filename-based `BpmnFileEditorProvider.accept()`:
 *
 *  1. **Marketplace recommendation prerequisite.** JetBrains' Feature Extractor
 *     reads the `extensions` attribute on `com.intellij.fileType` via static
 *     bytecode analysis to decide which plugin handles a missing extension and
 *     surface the "Plugins supporting *.bpmn files found" banner. A filename
 *     check inside `accept()` is invisible to that extractor.
 *  2. **Secondary text tab keeps XML highlighting.** `BpmnFileEditorProvider`
 *     uses `PLACE_BEFORE_DEFAULT_EDITOR`, so the JCEF modeler stays primary and
 *     the platform text editor opens as a secondary tab. Basing this file type
 *     on `XMLLanguage` ensures that secondary tab still gets proper XML lexing,
 *     folding, and inspections — the round-tripped XML is meant to stay
 *     reachable for inspection and source edits.
 */
object BpmnFileType : LanguageFileType(XMLLanguage.INSTANCE) {
    override fun getName(): String = "BPMN"

    override fun getDescription(): String = "BPMN 2.0 process diagram"

    override fun getDefaultExtension(): String = "bpmn"

    // Deliberately NOT the marketplace logo (`/META-INF/pluginIcon.svg`): that
    // asset is a 40×40 badge tuned for the Plugins/Marketplace listing, and the
    // platform downscales the file-type icon to 16×16 for tree rows and editor
    // tabs, where the badge turned into an illegible blob. `/icons/bpmn.svg` is
    // a dedicated 16×16 glyph. The "B" is baked to a `<path>` (not `<text>`) so
    // it renders identically regardless of the fonts available to IntelliJ's
    // SVG icon loader.
    override fun getIcon(): Icon =
        IconLoader.getIcon("/icons/bpmn.svg", BpmnFileType::class.java)

    // The Kotlin `object` declaration auto-generates a `public static final`
    // `INSTANCE` field on the compiled class, which is what plugin.xml's
    // `fieldName="INSTANCE"` reflects on — no explicit field needed here.
}
