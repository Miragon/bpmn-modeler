import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask

plugins {
    kotlin("jvm") version "2.0.20"
    id("org.jetbrains.intellij.platform") version "2.5.0"
}

group = "io.miragon"
version = "0.1.0-SPIKE"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        // 2024.2+ ships JCEF, which the JCEF-backed editor needs.
        intellijIdeaCommunity(providers.gradleProperty("ideaVersion").get())
    }
    // Gson does the JSON encode/decode for the host ↔ webview message bridge.
    // Hand-built strings are unsafe here: SyncDocumentCommand carries the full
    // BPMN XML, which must round-trip through proper escaping.
    implementation("com.google.code.gson:gson:2.11.0")
}

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            // 242 == 2024.2; the editor API and bundled JCEF used here are stable from here on.
            // untilBuild is left at the plugin default — the spike runs the pinned IDEA only.
            sinceBuild = "242"
        }
    }
}

// Both the webview bundle and the modeler-core server are pre-built by the yarn
// workspace. This Gradle build never invokes the JS toolchain; it only packages
// the already-built artefacts so `runIde` and the distributable zip carry them.
val webviewDist = layout.projectDirectory.dir("../../dist/webview-staging/bpmn-webview")
val coreServer = layout.projectDirectory.file("../../dist/host-bridge/server.js")
val stagedResourcesRoot = layout.buildDirectory.dir("modeler-resources")

val copyWebview =
    tasks.register<Copy>("copyWebview") {
        description = "Stages the pre-built bpmn-webview bundle into plugin resources (served from the classpath at runtime)."
        doFirst {
            if (!webviewDist.asFile.exists()) {
                throw GradleException(
                    "Webview bundle not found at ${webviewDist.asFile}.\n" +
                        "Run `corepack yarn build:bpmn-webview` from the repo root first.",
                )
            }
        }
        from(webviewDist)
        // Nest under `webview/` so the served classpath path is `/webview/...`.
        into(stagedResourcesRoot.map { it.dir("webview") })
    }

val copyCore =
    tasks.register<Copy>("copyCore") {
        description = "Stages the pre-built out-of-process modeler core into plugin resources (extracted and spawned at runtime)."
        doFirst {
            if (!coreServer.asFile.exists()) {
                throw GradleException(
                    "Modeler core bundle not found at ${coreServer.asFile}.\n" +
                        "Run `corepack yarn build:bridge` from the repo root first.",
                )
            }
        }
        from(coreServer)
        // Lands at `/core/server.js` on the classpath (CoreProcess reads it there).
        into(stagedResourcesRoot.map { it.dir("core") })
    }

sourceSets.named("main") {
    resources.srcDir(stagedResourcesRoot)
}

tasks.named<ProcessResources>("processResources") {
    dependsOn(copyWebview, copyCore)
}

// The sandbox for `runIde` is assembled from the jar, which already contains the
// staged resources, so no extra sandbox wiring is needed — but make the
// dependency explicit so a clean `runIde` always stages the bundles first.
tasks.withType<PrepareSandboxTask>().configureEach {
    dependsOn(copyWebview, copyCore)
}
