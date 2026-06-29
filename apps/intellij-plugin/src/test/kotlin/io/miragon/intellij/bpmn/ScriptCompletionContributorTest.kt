package io.miragon.intellij.bpmn

import com.intellij.testFramework.fixtures.LightJavaCodeInsightFixtureTestCase5
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test

/**
 * Guards the de-duplication contract of [ScriptCompletionContributor] against the
 * live completion pipeline. The contributor renders our catalog, while
 * [ScriptBindingMembersContributor] separately injects every catalog symbol as
 * synthetic Groovy PSI so the bare name *resolves* — which makes Groovy's native
 * completion re-emit each as a second, untyped lookup. The regression these tests
 * lock down is that exact double: a manifest-declared variable must surface
 * **once**, while genuine Groovy completions (keywords) still pass through.
 *
 * Uses [LightJavaCodeInsightFixtureTestCase5] — the JUnit5 code-insight base class
 * — because it manages the light-project lifecycle the suite's leak tracker
 * expects (a hand-rolled `createCodeInsightFixture` leaks the project into the
 * application disposer tree). The Groovy plugin is on the test classpath, so a
 * `.groovy` tab resolves through the real binding contributor.
 */
class ScriptCompletionContributorTest : LightJavaCodeInsightFixtureTestCase5() {

    // The base class defaults to a COMMUNITY-relative test-data path that doesn't
    // exist in the gradle-downloaded SDK; resolving it throws. These tests build
    // their PSI with configureByText (no data files), so any real directory works.
    override fun getTestDataPath(): String = System.getProperty("java.io.tmpdir")

    @Test
    fun `manifest-declared variable surfaces exactly once`() {
        // Two variables share the `ten` prefix so the popup stays open (a single
        // match would auto-insert and hide the list), letting us count duplicates.
        val result =
            completeScript(
                "ten",
                variable("tenantId", typeHint = "String", description = "The tenant"),
                variable("tenantName", typeHint = "String"),
            )

        assertEquals(
            1,
            result.lookups.count { it == "tenantId" },
            "tenantId should appear once, not duplicated; got: ${result.lookups}",
        )
        assertEquals(
            1,
            result.lookups.count { it == "tenantName" },
            "tenantName should appear once, not duplicated; got: ${result.lookups}",
        )
    }

    @Test
    fun `groovy keywords still complete past the filter`() {
        // `def` is a genuine Groovy keyword the native contributor supplies; our
        // name filter must let it through (the point of `language="any"`). It is
        // the sole `de` match, so completion auto-inserts it — assert on the
        // resulting text as well as any open popup.
        val result = completeScript("de", variable("tenantId", typeHint = "String"))

        val keywordCompleted = "def" in result.lookups || result.resultText.trim() == "def"
        assertTrue(keywordCompleted, "Groovy keyword `def` should still complete; got: $result")
    }

    /** The lookups offered (empty when a single match auto-inserts) plus the resulting document text. */
    private data class CompletionOutcome(val lookups: List<String>, val resultText: String)

    /**
     * Configures a Groovy script tab carrying [variables] as its catalog and runs
     * basic completion with the caret right after [prefix]. Attaching the
     * [SCRIPT_COMPLETION_KEY] UserData is what scopes both contributors to this
     * file — exactly as `ScriptEditorManager` does for real "Edit Script" tabs.
     */
    private fun completeScript(prefix: String, vararg variables: VariableInfo): CompletionOutcome {
        val model =
            ScriptCompletionModel(
                beans = emptyList(),
                variables = variables.toList(),
                globals = emptyList(),
                types = emptyMap(),
            )
        val psiFile = fixture.configureByText("script.groovy", "$prefix<caret>")
        psiFile.virtualFile.putUserData(SCRIPT_COMPLETION_KEY, model)
        fixture.completeBasic()
        return CompletionOutcome(
            lookups = fixture.lookupElementStrings.orEmpty(),
            resultText = fixture.editor.document.text,
        )
    }

    private fun variable(
        name: String,
        typeHint: String? = null,
        description: String? = null,
    ): VariableInfo = VariableInfo(name = name, origin = null, typeHint = typeHint, description = description)

    companion object {
        @JvmStatic
        @BeforeAll
        fun disableJcef() {
            // Opening the light project runs BridgeWarmupActivity, which spins up a
            // JCEF browser and leaks a Swing timer the leak tracker rejects. Disable
            // JCEF for this suite (irrelevant to completion) before the project opens.
            System.setProperty("ide.browser.jcef.enabled", "false")
        }
    }
}
