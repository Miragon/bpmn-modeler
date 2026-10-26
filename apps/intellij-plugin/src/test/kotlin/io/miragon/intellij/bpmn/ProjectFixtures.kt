package io.miragon.intellij.bpmn

import com.intellij.ide.impl.OpenProjectTask
import com.intellij.openapi.project.Project
import com.intellij.testFramework.junit5.fixture.TestFixture
import com.intellij.testFramework.junit5.fixture.projectFixture

// Preloaded services finish after forceCloseProjectAsync on slow runners and keep
// the closed project alive, failing the @TestApplication leak check.
internal fun projectFixtureWithoutServicePreload(): TestFixture<Project> =
    projectFixture(openProjectTask = OpenProjectTask { preloadServices = false })
