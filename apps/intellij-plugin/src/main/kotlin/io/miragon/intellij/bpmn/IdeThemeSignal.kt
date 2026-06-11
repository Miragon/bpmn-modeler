package io.miragon.intellij.bpmn

import com.google.gson.Gson
import com.intellij.ide.ui.LafManagerListener
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.util.Disposer
import com.intellij.ui.ColorUtil
import com.intellij.ui.JBColor
import com.intellij.util.containers.ContainerUtil
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.NamedColorUtil
import com.intellij.util.ui.StartupUiUtil
import com.intellij.util.ui.UIUtil
import org.cef.browser.CefBrowser

/**
 * Bridges the IntelliJ IDE color theme into the JCEF-hosted bpmn-webview so the
 * webview's `colorTheme = "automatic"` mode follows the IDE, exactly as it
 * follows VS Code.
 *
 * VS Code injects `vscode-dark` / `vscode-light` body classes plus its
 * `--vscode-*` color variables into every webview; `app/theme.ts` reads the
 * class (via a MutationObserver) to swap the bpmn-js stylesheet, and the dark
 * stylesheet reads the variables for its surface colors. The JCEF host sets
 * neither, so `automatic` always rendered light. This service reproduces both
 * signals from the live IDE theme and keeps them in sync on theme changes.
 *
 * It owns dark detection, the IDE→`--vscode-*` color mapping, the HTML/JS
 * snippet generation, and the change fan-out — keeping [WebviewServer] and the
 * editors free of theming logic (SRP). Dark detection deliberately uses the
 * **LaF** ([StartupUiUtil.isDarkTheme]), not the editor scheme, so the palette
 * and properties panel match the IDE chrome; the canvas additionally receives
 * the real editor-scheme background/foreground through the injected variables.
 */
@Service(Service.Level.APP)
class IdeThemeSignal : Disposable {
    private val gson = Gson()

    // Lock-free because change notifications arrive on the EDT while editors
    // register/deregister their callbacks from the same thread — but a
    // copy-on-write list also tolerates the rare cross-thread dispose.
    private val listeners: MutableList<() -> Unit> = ContainerUtil.createLockFreeCopyOnWriteList()

    init {
        // The editor scheme can change independently of the LaF (a user can pick
        // a dark editor scheme under a light IDE theme and vice versa), so both
        // topics must be watched: LaF drives the body class, the editor scheme
        // drives the injected canvas colors. connect(this) ties the subscription
        // lifetime to this service's disposal.
        val connection = ApplicationManager.getApplication().messageBus.connect(this)
        connection.subscribe(LafManagerListener.TOPIC, LafManagerListener { notifyListeners() })
        connection.subscribe(EditorColorsManager.TOPIC, EditorColorsListener { notifyListeners() })
    }

    /** LaF-based dark detection — matches the IDE chrome the webview sits in. */
    fun isDark(): Boolean = StartupUiUtil.isDarkTheme

    /** The body class VS Code would set; `app/theme.ts` keys its stylesheet swap off this. */
    fun bodyClass(): String = if (isDark()) "vscode-dark" else "vscode-light"

    /**
     * The `:root { … }` block mapping the eight `--vscode-*` custom properties
     * the webview's dark stylesheet actually reads onto live IDE colors. Safe to
     * inject under a light LaF too: the light stylesheet references none of them,
     * so the values are simply unused.
     */
    fun themeVarsCss(): String {
        val scheme = EditorColorsManager.getInstance().globalScheme
        val editorBackground = ColorUtil.toHtmlColor(scheme.defaultBackground)
        val editorForeground = ColorUtil.toHtmlColor(scheme.defaultForeground)
        val widgetBackground = ColorUtil.toHtmlColor(UIUtil.getPanelBackground())
        val inputBackground =
            ColorUtil.toHtmlColor(JBColor.namedColor("TextField.background", UIUtil.getPanelBackground()))
        val groupBorder = ColorUtil.toHtmlColor(JBColor.border())
        val errorForeground = ColorUtil.toHtmlColor(NamedColorUtil.getErrorForeground())
        val linkForeground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Link.Foreground.ENABLED)
        val disabledForeground = ColorUtil.toHtmlColor(NamedColorUtil.getInactiveTextColor())
        return listOf(
            ":root {",
            "  --vscode-editor-background: $editorBackground;",
            "  --vscode-editor-foreground: $editorForeground;",
            "  --vscode-editorWidget-background: $widgetBackground;",
            "  --vscode-input-background: $inputBackground;",
            "  --vscode-editorGroup-border: $groupBorder;",
            "  --vscode-errorForeground: $errorForeground;",
            "  --vscode-textLink-foreground: $linkForeground;",
            "  --vscode-disabledForeground: $disabledForeground;",
            "}",
        ).joinToString("\n")
    }

    /**
     * The JS that re-applies the current theme to an already-loaded page. It
     * toggles both body classes (one is always present, matching VS Code, so the
     * webview's MutationObserver fires and swaps the stylesheet) and replaces the
     * `#ide-theme-vars` style block's text with freshly mapped colors. The CSS is
     * embedded as a Gson-encoded string literal so any characters stay JS-safe.
     */
    fun applyJs(): String {
        val dark = isDark()
        val cssLiteral = gson.toJson(themeVarsCss())
        return buildString {
            append("(function(){")
            append("var c=document.body.classList;")
            append("c.toggle('vscode-dark',$dark);")
            append("c.toggle('vscode-light',${!dark});")
            append("var e=document.getElementById('ide-theme-vars');")
            append("if(e)e.textContent=$cssLiteral;")
            append("})();")
        }
    }

    /**
     * Registers [browser] to receive live theme updates until [parentDisposable]
     * is disposed. The callback pushes [applyJs] into the page on every LaF or
     * editor-scheme change; CEF marshals `executeJavaScript` internally, so it is
     * safe to invoke from the EDT delivery thread (same pattern as CoreSession's
     * off-EDT pushes).
     */
    fun follow(parentDisposable: Disposable, browser: CefBrowser) {
        val callback: () -> Unit = {
            runCatching { browser.executeJavaScript(applyJs(), browser.url, 0) }
        }
        listeners.add(callback)
        Disposer.register(parentDisposable) { listeners.remove(callback) }
    }

    private fun notifyListeners() {
        listeners.forEach { runCatching { it() } }
    }

    override fun dispose() {
        listeners.clear()
    }
}
