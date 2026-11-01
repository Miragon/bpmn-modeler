package io.miragon.intellij.bpmn.bridge

import com.intellij.testFramework.junit5.TestApplication
import io.miragon.intellij.bpmn.projectFixtureWithoutServicePreload
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Covers the outbound Tools-menu notifications of [ModelerCommandsRouter] over
 * the real [RpcChannel] transport (a [FakeProcess], per [RouterTestSupport]).
 * Each frame must carry the param keys `protocol.json` lists for its method.
 */
@TestApplication
class ModelerCommandsRouterTest {
    private val projectFixture = projectFixtureWithoutServicePreload()

    private val descriptor = ProtocolDescriptor.load()

    // Closed in teardown so the transport's daemon threads do not trip ThreadLeakTracker.
    private var wired: WiredBridge? = null

    @AfterEach
    fun tearDown() {
        wired?.dispose()
    }

    private fun router(): Pair<WiredBridge, ModelerCommandsRouter> {
        val wired = wireChannel().also { this.wired = it }
        val deps = bridgeDeps(projectFixture.get(), wired.channel, wired.handlers)
        return wired to ModelerCommandsRouter(deps)
    }

    private fun sentFrame(send: ModelerCommandsRouter.() -> Unit): SentFrame {
        val (wired, router) = router()
        router.send()
        return SentFrame.of(wired.fake.nextFrame())
    }

    private fun descriptorFrame(method: String) = SentFrame(method, descriptor.paramKeys(method))

    @Test
    fun `formatDiagram notifies layout format`() {
        assertEquals(descriptorFrame("layout/format"), sentFrame { formatDiagram() })
    }

    @Test
    fun `cleanupDiagram notifies layout cleanup`() {
        assertEquals(descriptorFrame("layout/cleanup"), sentFrame { cleanupDiagram() })
    }

    @Test
    fun `toggleLinting notifies linting toggle once`() {
        val (wired, router) = router()

        router.toggleLinting()

        assertEquals(listOf(descriptorFrame("linting/toggle")), wired.fake.framesUntilQuiet().map(SentFrame::of))
    }

    @Test
    fun `switchDeploymentTarget notifies deployment switchTarget`() {
        assertEquals(descriptorFrame("deployment/switchTarget"), sentFrame { switchDeploymentTarget() })
    }

    @Test
    fun `deployFiles notifies deployment deployFiles`() {
        assertEquals(descriptorFrame("deployment/deployFiles"), sentFrame { deployFiles() })
    }

    @Test
    fun `deployDiagram notifies deployment deployActive`() {
        assertEquals(descriptorFrame("deployment/deployActive"), sentFrame { deployDiagram() })
    }

    @Test
    fun `verifyDeployment notifies deployment verify`() {
        assertEquals(descriptorFrame("deployment/verify"), sentFrame { verifyDeployment() })
    }

    @Test
    fun `deploymentStatusMenu notifies deployment statusBarMenu`() {
        assertEquals(descriptorFrame("deployment/statusBarMenu"), sentFrame { deploymentStatusMenu() })
    }
}
