package io.miragon.intellij.bpmn.bridge

import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.SCRIPT_ID_KEY
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import io.miragon.intellij.bpmn.readTypeScriptCases
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Named
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import java.nio.file.Files
import java.nio.file.Path

/**
 * Covers the [ScriptRouter] Tools-menu notification over the real [RpcChannel] +
 * [RpcHandlerRegistry] transport (a [FakeProcess], per [RouterTestSupport]).
 */
@TestApplication
class ScriptRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val gson = Gson()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    @Test
    fun `openAllScriptTasks emits script openAll with empty params`() {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        val router = ScriptRouter(deps)

        router.openAllScriptTasks()

        val frame = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
        assertEquals("script/openAll", frame.get("method").asString)
        // A payload-free notification: the bridge derives the target from its own
        // active-editor pointer, so the params object carries no keys.
        assertTrue(frame.getAsJsonObject("params").entrySet().isEmpty(), "params must be empty")
    }

    @Test
    fun `notifyDidOpenExternal emits script didOpenExternal with the file path`() {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        val router = ScriptRouter(deps)

        // Exercise the extracted notify directly: the adoption decision (skip our
        // own opens / non-tmp-scripting files) is a pure fileOpened branch, but the
        // emitted frame — the core-facing contract — is what a drift here would break.
        router.notifyDidOpenExternal("/ws/.camunda/tmp/scripting/h/Task_1/script-task/Task_1.js")

        val frame = gson.fromJson(wired.fake.nextFrame(), JsonObject::class.java)
        assertEquals("script/didOpenExternal", frame.get("method").asString)
        assertEquals(
            "/ws/.camunda/tmp/scripting/h/Task_1/script-task/Task_1.js",
            frame.getAsJsonObject("params").get("filePath").asString,
        )
    }

    @ParameterizedTest
    @MethodSource("scriptTabsCases")
    fun `opens and closes the tabs the script loopback does`(
        case: JsonObject,
        @TempDir workspace: Path,
    ) {
        val wired = wireChannel().also { this.wired = it }
        val project = projectFixture.get()
        ScriptRouter(bridgeDeps(project, wired.channel, wired.handlers)).register()
        val editors = FileEditorManager.getInstance(project)
        val application = ApplicationManager.getApplication()

        case.getAsJsonArray("steps").map { it.asJsonObject }.forEach { step ->
            val scriptId = step.get("scriptId").asString
            if (step.get("by").asString == "user") {
                application.invokeAndWait { editors.closeFile(editors.openFiles.single { it.scriptId == scriptId }) }
            } else {
                val scriptFile = scriptFileWrittenByTheCore(workspace, scriptId)
                val params =
                    obj("scriptId" to scriptId, "fileName" to "$scriptId.js", "filePath" to scriptFile.toString(), "content" to "")
                wired.handlers.dispatch(step.get("method").asString, params, null)
            }
            // Runs the EDT turn the router deferred the step to, the close ack included.
            application.invokeAndWait {}
        }

        val sent = JsonArray().apply { wired.fake.framesUntilQuiet().forEach { add(JsonParser.parseString(it)) } }
        assertEquals(case.getAsJsonArray("sentToBridge"), sent)
        assertEquals(case.getAsJsonArray("openTabs").map { it.asString }, editors.openFiles.mapNotNull { it.scriptId })
    }

    private val VirtualFile.scriptId: String? get() = getUserData(SCRIPT_ID_KEY)

    private fun scriptFileWrittenByTheCore(workspace: Path, scriptId: String): Path {
        val scriptFile = workspace.resolve(".camunda/tmp/scripting/h/$scriptId.js")
        Files.createDirectories(scriptFile.parent)
        if (Files.notExists(scriptFile)) Files.writeString(scriptFile, "")
        return scriptFile
    }

    private fun obj(vararg entries: Pair<String, String>): JsonObject =
        JsonObject().apply { entries.forEach { (key, value) -> addProperty(key, value) } }

    companion object {
        /** `intellijScriptTabs.cases.json`, which the bridge's script tab loopback answers too. */
        @JvmStatic
        fun scriptTabsCases(): List<Named<JsonObject>> = readTypeScriptCases("miragon.intellijScriptTabsCases")
    }
}
