package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.junit5.TestApplication
import com.intellij.ui.JBColor
import org.cef.browser.CefBrowser
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy

@TestApplication
class IdeThemeSignalTest {
    private val signal = IdeThemeSignal()

    private var wasDark = false

    @BeforeEach
    fun rememberTheme() {
        wasDark = !JBColor.isBright()
        JBColor.setDark(false)
    }

    @AfterEach
    fun restoreTheme() {
        JBColor.setDark(wasDark)
        Disposer.dispose(signal)
    }

    private class RecordingBrowser {
        val executedScripts = mutableListOf<String>()

        val browser: CefBrowser =
            Proxy.newProxyInstance(CefBrowser::class.java.classLoader, arrayOf(CefBrowser::class.java)) { _, method, args ->
                when (method.name) {
                    "executeJavaScript" -> executedScripts += args[0] as String
                    "getURL" -> return@newProxyInstance "http://127.0.0.1/index.html"
                }
                null
            } as CefBrowser
    }

    private fun publishEditorSchemeChange() {
        ApplicationManager.getApplication().messageBus.syncPublisher(EditorColorsManager.TOPIC).globalSchemeChange(null)
    }

    @Test
    fun `a light LaF yields the light body class and color scheme`() {
        assertEquals("vscode-light", signal.bodyClass())
        assertTrue(signal.themeVarsCss().contains("color-scheme: light;"))
        assertTrue(signal.deploymentThemeVarsCss().contains("color-scheme: light;"))
    }

    @Test
    fun `a dark LaF yields the dark body class and color scheme`() {
        JBColor.setDark(true)

        assertTrue(signal.isDark())
        assertEquals("vscode-dark", signal.bodyClass())
        assertTrue(signal.themeVarsCss().contains("color-scheme: dark;"))
        assertTrue(signal.deploymentThemeVarsCss().contains("color-scheme: dark;"))
    }

    @Test
    fun `the bpmn vars cover every variable the dark stylesheet reads`() {
        val css = signal.themeVarsCss()

        BPMN_VARIABLES.forEach { assertTrue(Regex("""\Q$it\E: #[0-9a-fA-F]{6,8};""").containsMatchIn(css), it) }
        assertTrue(css.contains("--input-background-color:"))
        assertTrue(css.contains("--input-focus-background-color:"))
    }

    @Test
    fun `the deployment vars cover every variable the deployment form reads`() {
        val css = signal.deploymentThemeVarsCss()

        DEPLOYMENT_VARIABLES.forEach { assertTrue(Regex("""\Q$it\E: #[0-9a-fA-F]{6,8};""").containsMatchIn(css), it) }
    }

    @Test
    fun `applyJs toggles both body classes and embeds the css as a JS string literal`() {
        val awkwardCss = "a { content: \"x\"; }\n</style><script>alert('y')</script>"

        val script = signal.applyJs(awkwardCss)

        assertTrue(script.contains("c.toggle('vscode-dark',false);"))
        assertTrue(script.contains("c.toggle('vscode-light',true);"))
        val literal = script.substringAfter("e.textContent=").substringBeforeLast(";})();")
        assertEquals(awkwardCss, Gson().fromJson(literal, String::class.java))
    }

    @Test
    fun `deploymentApplyJs carries the deployment variable set`() {
        assertTrue(signal.deploymentApplyJs().contains("--vscode-button-background"))
    }

    @Test
    fun `followed browsers are re-themed on every scheme change until their parent is disposed`() {
        val parent = Disposer.newDisposable()
        val recording = RecordingBrowser()
        signal.follow(parent, recording.browser) { "apply();" }

        publishEditorSchemeChange()
        publishEditorSchemeChange()
        Disposer.dispose(parent)
        publishEditorSchemeChange()

        assertEquals(listOf("apply();", "apply();"), recording.executedScripts)
    }

    @Test
    fun `one failing browser does not stop the others from being re-themed`() {
        val parent = Disposer.newDisposable()
        val recording = RecordingBrowser()
        signal.follow(parent, recording.browser) { error("browser gone") }
        signal.follow(parent, recording.browser) { "apply();" }

        publishEditorSchemeChange()
        Disposer.dispose(parent)

        assertEquals(listOf("apply();"), recording.executedScripts)
    }

    @Test
    fun `the default producer pushes the bpmn applyJs`() {
        val parent = Disposer.newDisposable()
        val recording = RecordingBrowser()
        signal.follow(parent, recording.browser)

        publishEditorSchemeChange()
        Disposer.dispose(parent)

        assertEquals(listOf(signal.applyJs()), recording.executedScripts)
    }

    private companion object {
        val BPMN_VARIABLES =
            listOf(
                "--vscode-editor-background",
                "--vscode-editor-foreground",
                "--vscode-editorWidget-background",
                "--vscode-input-background",
                "--vscode-editorGroup-border",
                "--vscode-errorForeground",
                "--vscode-textLink-foreground",
                "--vscode-disabledForeground",
            )

        val DEPLOYMENT_VARIABLES =
            listOf(
                "--vscode-foreground",
                "--vscode-descriptionForeground",
                "--vscode-icon-foreground",
                "--vscode-editor-background",
                "--vscode-sideBar-background",
                "--vscode-sideBarSectionHeader-background",
                "--vscode-sideBarSectionHeader-foreground",
                "--vscode-panel-border",
                "--vscode-list-hoverBackground",
                "--vscode-focusBorder",
                "--vscode-input-background",
                "--vscode-input-foreground",
                "--vscode-input-border",
                "--vscode-button-background",
                "--vscode-button-foreground",
                "--vscode-button-hoverBackground",
                "--vscode-button-secondaryBackground",
                "--vscode-button-secondaryForeground",
                "--vscode-button-secondaryHoverBackground",
                "--vscode-errorForeground",
                "--vscode-notifications-background",
                "--vscode-inputValidation-infoBackground",
                "--vscode-inputValidation-infoBorder",
                "--vscode-inputValidation-infoForeground",
                "--vscode-inputValidation-errorBackground",
                "--vscode-inputValidation-errorBorder",
                "--vscode-inputValidation-errorForeground",
            )
    }
}
