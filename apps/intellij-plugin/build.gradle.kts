import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask

plugins {
    kotlin("jvm") version "2.0.20"
    id("org.jetbrains.intellij.platform") version "2.5.0"
}

group = "io.miragon"
version = "0.1.0"

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
    // Gson does the JSON encode/decode for the host ↔ bridge ↔ webview messages.
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
            sinceBuild = "242"
        }
    }
}

// The webview bundles (bpmn + deployment) and the modeler-core bridge binary are
// pre-built by the yarn workspace (`corepack yarn build:bpmn-webview`,
// `build:deployment-webview`, and `workspace @miragon/bpmn-modeler-bridge compile`).
// This Gradle build never invokes the JS/Bun toolchain; it only packages the
// already-built artefacts so `runIde` and the distributable zip carry them. See
// apps/modeler-bridge/README.md.
val webviewDist = layout.projectDirectory.dir("../../dist/webview-staging/bpmn-webview")
val deploymentWebviewDist =
    layout.projectDirectory.dir("../../dist/webview-staging/deployment-webview")
val bridgeBinary = layout.projectDirectory.file("../../apps/modeler-bridge/dist/modeler-bridge")
val stagedResourcesRoot = layout.buildDirectory.dir("modeler-resources")

/**
 * The `<os>-<arch>` directory the bridge binary is staged under and the runtime
 * (CoreProcess) resolves at launch. The Bun `--compile --target` flag decides
 * the binary's real platform; this PR stages only the host target, so the build
 * machine must match the publish target. A release pipeline loops `--target` and
 * stages each platform under its own directory.
 */
fun hostPlatformDir(): String {
    val os = System.getProperty("os.name").lowercase()
    val arch = System.getProperty("os.arch").lowercase()
    val osPart =
        when {
            os.contains("mac") || os.contains("darwin") -> "darwin"
            os.contains("win") -> "windows"
            else -> "linux"
        }
    val archPart = if (arch.contains("aarch64") || arch.contains("arm")) "arm64" else "x64"
    return "$osPart-$archPart"
}

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

val copyDeploymentWebview =
    tasks.register<Copy>("copyDeploymentWebview") {
        description = "Stages the pre-built deployment-webview bundle into plugin resources (served from the classpath at runtime)."
        doFirst {
            if (!deploymentWebviewDist.asFile.exists()) {
                throw GradleException(
                    "Deployment webview bundle not found at ${deploymentWebviewDist.asFile}.\n" +
                        "Run `corepack yarn build:deployment-webview` from the repo root first.",
                )
            }
        }
        from(deploymentWebviewDist)
        // Nest under `webview-deployment/` so the served classpath path is `/webview-deployment/...`.
        into(stagedResourcesRoot.map { it.dir("webview-deployment") })
    }

val copyBridge =
    tasks.register<Copy>("copyBridge") {
        description = "Stages the pre-built Node-free modeler-core bridge binary into plugin resources (extracted and spawned at runtime)."
        doFirst {
            if (!bridgeBinary.asFile.exists()) {
                throw GradleException(
                    "Modeler bridge binary not found at ${bridgeBinary.asFile}.\n" +
                        "Run `corepack yarn workspace @miragon/bpmn-modeler-bridge compile` from the repo root first.",
                )
            }
        }
        from(bridgeBinary)
        // Lands at `/bin/<os>-<arch>/modeler-bridge` on the classpath (CoreProcess reads it there).
        into(stagedResourcesRoot.map { it.dir("bin/${hostPlatformDir()}") })
    }

sourceSets.named("main") {
    resources.srcDir(stagedResourcesRoot)
}

tasks.named<ProcessResources>("processResources") {
    dependsOn(copyWebview, copyDeploymentWebview, copyBridge)
}

// The sandbox for `runIde` is assembled from the jar, which already contains the
// staged resources, so no extra sandbox wiring is needed — but make the
// dependency explicit so a clean `runIde` always stages the bundles first.
tasks.withType<PrepareSandboxTask>().configureEach {
    dependsOn(copyWebview, copyDeploymentWebview, copyBridge)
}
