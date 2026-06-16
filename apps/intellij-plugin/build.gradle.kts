import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.intellij.platform)
}

group = "io.miragon"
version = "1.0.1" // x-release-please-version

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
        // Groovy PSI for the "Edit Script" binding resolver
        // (ScriptBindingMembersContributor). The Groovy plugin transitively brings
        // the Java plugin that provides LightPsiClassBuilder/PsiElementFactory.
        bundledPlugin("org.intellij.groovy")
        bundledPlugin("com.intellij.java")
    }
    // Gson does the JSON encode/decode for the host ↔ bridge ↔ webview messages.
    // Hand-built strings are unsafe here: SyncDocumentCommand carries the full
    // BPMN XML, which must round-trip through proper escaping.
    implementation(libs.gson)
}

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            // 242 == 2024.2; the editor API and bundled JCEF used here are stable from here on.
            sinceBuild = "242"
            // The Gradle plugin defaults untilBuild to "242.*" when unset, which
            // rejects every IDE newer than 2024.2 at install time. Null removes
            // the upper bound entirely (the documented opt-out).
            untilBuild = provider { null }
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
val bridgeDistRoot = layout.projectDirectory.dir("../../apps/modeler-bridge/dist")
val stagedResourcesRoot = layout.buildDirectory.dir("modeler-resources")

/**
 * Release distribution mode: when set, stage every per-platform bridge binary
 * under `bin/<os>-<arch>/` so the published ZIP runs on any host. Default
 * (host-only) keeps `runIde` and local dev cycles fast — they only need the
 * one binary that matches the developer's machine.
 */
val bundleAllPlatforms = providers.gradleProperty("bundleAllPlatforms").isPresent

/**
 * The 5 platforms shipped in a release ZIP. Tuples are
 * (`<os>-<arch>` resource dir, source binary filename produced by Bun).
 * Bun appends `.exe` to the windows-x64 target; the runtime resolver
 * (CoreProcess.resolveBridgeBinary) mirrors this — see step 3 of the
 * distribution plan.
 */
val releaseBridgeTargets =
    listOf(
        "darwin-arm64" to "modeler-bridge",
        "darwin-x64" to "modeler-bridge",
        "linux-x64" to "modeler-bridge",
        "linux-arm64" to "modeler-bridge",
        "windows-x64" to "modeler-bridge.exe",
    )

/**
 * The `<os>-<arch>` directory the bridge binary is staged under and the runtime
 * (CoreProcess) resolves at launch. The Bun `--compile --target` flag decides
 * the binary's real platform; default (host-only) build stages the host target,
 * so the build machine must match the publish target. The release pipeline sets
 * `-PbundleAllPlatforms` to stage every platform under its own directory.
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
        description = "Stages the pre-built Node-free modeler-core bridge binary(ies) into plugin resources (extracted and spawned at runtime)."
        if (bundleAllPlatforms) {
            // Release mode: every per-platform binary must exist, otherwise the
            // shipped ZIP would silently lack a platform.
            doFirst {
                val missing =
                    releaseBridgeTargets.filter { (dir, name) ->
                        !bridgeDistRoot.file("$dir/$name").asFile.exists()
                    }
                if (missing.isNotEmpty()) {
                    throw GradleException(
                        "Missing bridge binaries for: ${missing.joinToString { it.first }}.\n" +
                            "Run `corepack yarn workspace @miragon/bpmn-modeler-bridge compile:all` from the repo root first.",
                    )
                }
            }
            releaseBridgeTargets.forEach { (platformDir, binaryName) ->
                from(bridgeDistRoot.file("$platformDir/$binaryName")) {
                    // Preserve the source filename (`.exe` for windows) so the
                    // runtime resolver finds the right artefact per platform.
                    into("bin/$platformDir")
                }
            }
            into(stagedResourcesRoot)
        } else {
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
