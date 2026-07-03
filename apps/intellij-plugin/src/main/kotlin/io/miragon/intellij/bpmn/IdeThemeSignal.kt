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
 * **LaF** ([JBColor.isBright]), not the editor scheme, so the palette and
 * properties panel match the IDE chrome; the canvas additionally receives the
 * real editor-scheme background/foreground through the injected variables.
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
    fun isDark(): Boolean = !JBColor.isBright()

    /** The body class VS Code would set; `app/theme.ts` keys its stylesheet swap off this. */
    fun bodyClass(): String = if (isDark()) "vscode-dark" else "vscode-light"

    /**
     * The `:root` vars are read only by the webview's dark stylesheet, so
     * they're inert under a light LaF. The `.bio-properties-panel` block applies
     * to both stylesheets, which is why it overrides directly with `!important`
     * instead of riding the dark-only `--vscode-*` mapping.
     */
    fun themeVarsCss(): String {
        val scheme = EditorColorsManager.getInstance().globalScheme
        val editorBackground = ColorUtil.toHtmlColor(scheme.defaultBackground)
        val editorForeground = ColorUtil.toHtmlColor(scheme.defaultForeground)
        val panelBg = UIUtil.getPanelBackground()
        val widgetBackground = ColorUtil.toHtmlColor(panelBg)
        val inputBackground =
            ColorUtil.toHtmlColor(JBColor.namedColor("TextField.background", panelBg))
        val groupBorder = ColorUtil.toHtmlColor(JBColor.border())
        val errorForeground = ColorUtil.toHtmlColor(NamedColorUtil.getErrorForeground())
        val linkForeground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Link.Foreground.ENABLED)
        val disabledForeground = ColorUtil.toHtmlColor(NamedColorUtil.getInactiveTextColor())
        // The New UI sets `TextField.background` to ~the panel background, so
        // bpmn-js inputs (which rely on fill contrast) merge into the panel.
        // Derive a contrasting fill: lighter under a dark LaF, darker under light.
        val inputContrast =
            ColorUtil.toHtmlColor(if (isDark()) ColorUtil.brighter(panelBg, 2) else ColorUtil.darker(panelBg, 1))
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
            ".bio-properties-panel {",
            "  --input-background-color: $inputContrast !important;",
            "  --input-focus-background-color: $inputContrast !important;",
            "}",
        ).joinToString("\n")
    }

    /**
     * The `--vscode-*` set the deployment form's stylesheet reads, mapped onto the
     * live IDE palette — the IDE-color counterpart of [WebviewServer]'s old
     * system-color block, so the form tracks the IDE theme, not the OS.
     *
     * The deployment form reads a different, larger variable set than the bpmn
     * webview, so it needs its own mapping. Every source below is a plain
     * UIDefaults/scheme read with no EDT affinity (callable off the EDT from the
     * HTTP pool thread, like [themeVarsCss]). The two `JBColor.namedColor` LaF keys
     * each carry a fallback, so an absent key degrades gracefully.
     */
    fun deploymentThemeVarsCss(): String {
        val scheme = EditorColorsManager.getInstance().globalScheme
        val panelBg = UIUtil.getPanelBackground()

        val foreground = ColorUtil.toHtmlColor(UIUtil.getLabelForeground())
        val descriptionForeground = ColorUtil.toHtmlColor(UIUtil.getContextHelpForeground())
        val editorBackground = ColorUtil.toHtmlColor(scheme.defaultBackground)
        val panelBackground = ColorUtil.toHtmlColor(panelBg)
        val border = ColorUtil.toHtmlColor(JBColor.border())
        val listHover = ColorUtil.toHtmlColor(UIUtil.getListSelectionBackground(false))
        val focusBorder = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Focus.focusColor())
        val inputBackground = ColorUtil.toHtmlColor(JBColor.namedColor("TextField.background", panelBg))
        val inputForeground = ColorUtil.toHtmlColor(UIUtil.getTextFieldForeground())
        val buttonBackground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Button.defaultButtonColorStart())
        val buttonForeground = ColorUtil.toHtmlColor(JBColor.namedColor("Button.default.foreground", JBColor.WHITE))
        val buttonHoverBackground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Button.defaultButtonColorEnd())
        val buttonSecondaryBackground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Button.buttonColorStart())
        val buttonSecondaryForeground =
            ColorUtil.toHtmlColor(JBColor.namedColor("Button.foreground", UIUtil.getLabelForeground()))
        val buttonSecondaryHoverBackground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Button.buttonColorEnd())
        val errorForeground = ColorUtil.toHtmlColor(NamedColorUtil.getErrorForeground())
        val notificationsBackground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.NotificationInfo.backgroundColor())
        val infoBackground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Banner.INFO_BACKGROUND)
        val infoBorder = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Banner.INFO_BORDER_COLOR)
        val bannerForeground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Banner.FOREGROUND)
        val errorBackground = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Banner.ERROR_BACKGROUND)
        val errorBorder = ColorUtil.toHtmlColor(JBUI.CurrentTheme.Banner.ERROR_BORDER_COLOR)

        return listOf(
            ":root {",
            "  --vscode-foreground: $foreground;",
            "  --vscode-descriptionForeground: $descriptionForeground;",
            "  --vscode-icon-foreground: $foreground;",
            "  --vscode-editor-background: $editorBackground;",
            "  --vscode-sideBar-background: $panelBackground;",
            "  --vscode-sideBarSectionHeader-background: $panelBackground;",
            "  --vscode-sideBarSectionHeader-foreground: $foreground;",
            "  --vscode-panel-border: $border;",
            "  --vscode-list-hoverBackground: $listHover;",
            "  --vscode-focusBorder: $focusBorder;",
            "  --vscode-input-background: $inputBackground;",
            "  --vscode-input-foreground: $inputForeground;",
            "  --vscode-input-border: $border;",
            "  --vscode-button-background: $buttonBackground;",
            "  --vscode-button-foreground: $buttonForeground;",
            "  --vscode-button-hoverBackground: $buttonHoverBackground;",
            "  --vscode-button-secondaryBackground: $buttonSecondaryBackground;",
            "  --vscode-button-secondaryForeground: $buttonSecondaryForeground;",
            "  --vscode-button-secondaryHoverBackground: $buttonSecondaryHoverBackground;",
            "  --vscode-errorForeground: $errorForeground;",
            "  --vscode-notifications-background: $notificationsBackground;",
            "  --vscode-inputValidation-infoBackground: $infoBackground;",
            "  --vscode-inputValidation-infoBorder: $infoBorder;",
            "  --vscode-inputValidation-infoForeground: $bannerForeground;",
            "  --vscode-inputValidation-errorBackground: $errorBackground;",
            "  --vscode-inputValidation-errorBorder: $errorBorder;",
            "  --vscode-inputValidation-errorForeground: $bannerForeground;",
            "}",
        ).joinToString("\n")
    }

    /**
     * The JS that re-applies the current theme to an already-loaded page. It
     * toggles both body classes (one is always present, matching VS Code, so the
     * webview's MutationObserver fires and swaps the stylesheet) and replaces the
     * `#ide-theme-vars` style block's text with freshly mapped colors. The CSS is
     * embedded as a Gson-encoded string literal so any characters stay JS-safe.
     *
     * [varsCss] defaults to the bpmn mapping; pass [deploymentThemeVarsCss] (via
     * [deploymentApplyJs]) for the deployment form. The body-class toggle is inert
     * for the deployment form — its CSS doesn't read the class — so the same JS
     * shape serves both pages.
     */
    fun applyJs(varsCss: String = themeVarsCss()): String {
        val dark = isDark()
        val cssLiteral = gson.toJson(varsCss)
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

    /** [applyJs] specialised for the deployment form's variable set. */
    fun deploymentApplyJs(): String = applyJs(deploymentThemeVarsCss())

    /**
     * Registers [browser] to receive live theme updates until [parentDisposable]
     * is disposed. The callback pushes the [applyJsProducer] output into the page
     * on every LaF or editor-scheme change; CEF marshals `executeJavaScript`
     * internally, so it is safe to invoke from the EDT delivery thread (same
     * pattern as CoreSession's off-EDT pushes).
     *
     * [applyJsProducer] defaults to the bpmn [applyJs]; the deployment tool window
     * passes [deploymentApplyJs] so the form gets its own variable set.
     */
    fun follow(
        parentDisposable: Disposable,
        browser: CefBrowser,
        applyJsProducer: () -> String = { applyJs() },
    ) {
        val callback: () -> Unit = {
            runCatching { browser.executeJavaScript(applyJsProducer(), browser.url, 0) }
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
