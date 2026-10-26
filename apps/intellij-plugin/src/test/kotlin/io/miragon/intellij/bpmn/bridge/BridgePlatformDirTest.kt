package io.miragon.intellij.bpmn.bridge

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource

class BridgePlatformDirTest {
    @ParameterizedTest
    @CsvSource(
        "Mac OS X, aarch64, darwin-arm64",
        "Mac OS X, x86_64, darwin-x64",
        "Darwin, arm64, darwin-arm64",
        "Windows 11, amd64, windows-x64",
        "Windows Server 2022, aarch64, windows-arm64",
        "Linux, amd64, linux-x64",
        "Linux, aarch64, linux-arm64",
        "Linux, armv7l, linux-arm64",
        "FreeBSD, amd64, linux-x64",
    )
    fun `maps the JVM os and arch onto the staged bridge directory`(
        osName: String,
        arch: String,
        expectedPlatformDir: String,
    ) {
        assertEquals(expectedPlatformDir, bridgePlatformDir(osName, arch))
    }
}
