package io.miragon.intellij.bpmn

import com.intellij.execution.RunManager
import com.intellij.ide.impl.OpenProjectTask
import com.intellij.openapi.components.serviceAsync
import com.intellij.openapi.project.Project
import com.intellij.testFramework.junit5.fixture.TestFixture
import com.intellij.testFramework.junit5.fixture.projectFixture
import com.intellij.testFramework.junit5.fixture.testFixture

// Preloaded services finish after forceCloseProjectAsync on slow runners and keep
// the closed project alive, failing the @TestApplication leak check.
internal fun projectFixtureWithoutServicePreload(): TestFixture<Project> {
    val platformProjectFixture = projectFixture(openProjectTask = OpenProjectTask { preloadServices = false })
    return testFixture {
        val project = platformProjectFixture.init()
        // The platform builds RunManager in the background even without preloading. A test
        // that finishes first disposes the project under its constructor, which then throws.
        project.serviceAsync<RunManager>()
        initialized(project) {}
    }
}
