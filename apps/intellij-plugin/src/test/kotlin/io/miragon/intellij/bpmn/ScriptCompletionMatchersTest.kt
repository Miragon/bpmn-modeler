package io.miragon.intellij.bpmn

import com.google.gson.JsonElement
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Named
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource

/** Runs the core's `scriptCompletion.cases.json` rows against the Kotlin port of its two matchers. */
class ScriptCompletionMatchersTest {
    @ParameterizedTest
    @MethodSource("cases")
    fun `reads a line prefix as the core does`(case: MatcherCase) {
        assertEquals(case.memberAccess, matchMemberAccess(case.linePrefix))
        assertEquals(case.variableStringArg, matchVariableStringArg(case.linePrefix))
    }

    class MatcherCase(val linePrefix: String, val memberAccess: String?, val variableStringArg: VariableStringArg?)

    companion object {
        private fun JsonElement.orNull(): JsonElement? = takeUnless { it.isJsonNull }

        @JvmStatic
        fun cases(): List<Named<MatcherCase>> =
            readTypeScriptJson("miragon.scriptCompletionCases").asJsonObject.getAsJsonArray("cases").map { row ->
                val case = row.asJsonObject
                val variableStringArg =
                    case.get("variableStringArg").orNull()?.asJsonObject?.let {
                        VariableStringArg(it.get("methodName").asString, it.get("partial").asString)
                    }
                val matcherCase =
                    MatcherCase(
                        case.get("linePrefix").asString,
                        case.get("memberAccess").orNull()?.asString,
                        variableStringArg,
                    )
                Named.of(case.get("name").asString, matcherCase)
            }
    }
}
