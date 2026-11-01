package io.miragon.intellij.bpmn.bridge

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.WriteAction
import com.intellij.openapi.command.CommandEvent
import com.intellij.openapi.command.CommandListener
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.Files
import java.nio.file.Path

/**
 * Shared setup for the JUnit5-fixture router tests, factoring out the bridge
 * wiring the same way [FakeProcess] / [DeterministicScheduler] factor out the
 * pure-JVM transport setup.
 *
 * The wiring is deliberately the *real* [RpcChannel] + [RpcHandlerRegistry] over a
 * [FakeProcess], so the tests exercise the genuine send path (a router's
 * `notify`/`reply` is drained by the writer thread onto the fake's stdin and read
 * back via [FakeProcess.nextFrame]). Inbound requests are injected by calling
 * [RpcHandlerRegistry.dispatch] **directly** on the test thread — deterministic,
 * and it avoids racing the reader-pump thread against the EDT pumping the
 * `invokeLater` bodies the handlers post.
 */
internal class WiredBridge(
    val fake: FakeProcess,
    val channel: RpcChannel,
    val handlers: RpcHandlerRegistry,
    private val generation: Int,
) {
    /** The id of a request [fake] sent, as the reader pump would dispatch it. */
    fun requestId(value: Int): CoreRequestId = CoreRequestId(value, generation)

    /**
     * Tears down the transport so its daemon threads (the channel's writer and the
     * fake's stdin/stdout pumps) exit — otherwise `@TestApplication`'s
     * `ThreadLeakTracker` fails the test for the surviving `modeler-bridge-writer`.
     * `close()` wakes the writer and EOFs the fake's stdin pump; `kill()` EOFs the
     * reader pump on the fake's stdout.
     */
    fun dispose() {
        channel.close()
        fake.kill()
    }
}

/**
 * Builds the registry + channel pair the way `CoreProcess` does, attaches it to a
 * fresh [FakeProcess], and returns the trio so a test can read outbound frames and
 * inject inbound requests.
 */
internal fun wireChannel(): WiredBridge {
    val handlers = RpcHandlerRegistry()
    val channel = RpcChannel { method, params, requestId -> handlers.dispatch(method, params, requestId) }
    val fake = FakeProcess()
    val generation = channel.attach(fake.outputStream, fake.inputStream)
    return WiredBridge(fake, channel, handlers, generation)
}

/**
 * Constructs [BridgeDeps] for a router under test. `isProcessAlive` returns true so
 * `notify`/`seed` sends are not no-oped, and `notifications` is wired to fail loudly
 * if a tested path ever forces it (none should). The default [parentDisposable]
 * dies with the project: a router's message-bus subscriptions would leak it otherwise.
 */
internal fun bridgeDeps(
    project: Project,
    channel: RpcChannel,
    handlers: RpcHandlerRegistry,
    parentDisposable: Disposable = Disposer.newDisposable(project, "router-under-test"),
): BridgeDeps =
    BridgeDeps(
        project = project,
        channel = channel,
        handlers = handlers,
        gson = channel.gson,
        isProcessAlive = { true },
        ensureStartedAsync = {},
        parentDisposable = parentDisposable,
        notifications = lazy { error("HostNotifications must not be forced in router tests") },
    )

/**
 * Throws [failure] from the next command's `commandFinished`, i.e. after the
 * write's `setText` already changed the Document.
 */
internal fun failNextCommandAfterItRuns(project: Project, failure: RuntimeException) {
    var thrown = false
    ApplicationManager.getApplication().messageBus.connect(project).subscribe(
        CommandListener.TOPIC,
        object : CommandListener {
            override fun commandFinished(event: CommandEvent) {
                if (thrown) return
                thrown = true
                throw failure
            }
        },
    )
}

/**
 * A real `.bpmn` [VirtualFile] plus its in-memory [Document], the pair the routers
 * act on. [nioPath] is kept so a test can delete the backing file in teardown:
 * `tempPathFixture` only removes the directory if it is *empty*, so the file it
 * holds must be cleaned up explicitly.
 */
internal class BpmnTestFile(val file: VirtualFile, val document: Document, val nioPath: Path)

/**
 * Writes [xml] to a real file under [dir] and surfaces it through the VFS so the
 * router gets a genuine [Document] whose `setText` synchronously fires the editor's
 * `DocumentListener` — the exact behaviour the causation test depends on and that a
 * fake document could only assume. The 2024.2 JUnit5 fixture API has no
 * `codeInsightFixture`, so the Document is obtained manually here.
 */
internal fun createBpmnFile(
    dir: Path,
    name: String,
    xml: String,
): BpmnTestFile {
    val nioPath = dir.resolve(name)
    Files.writeString(nioPath, xml)
    val file =
        WriteAction.computeAndWait<VirtualFile, RuntimeException> {
            LocalFileSystem.getInstance().refreshAndFindFileByNioFile(nioPath)
                ?: error("VFS did not surface the test file at $nioPath")
        }
    val document =
        FileDocumentManager.getInstance().getDocument(file)
            ?: error("No Document for $name — is the .bpmn file type registered in the test application?")
    return BpmnTestFile(file, document, nioPath)
}
