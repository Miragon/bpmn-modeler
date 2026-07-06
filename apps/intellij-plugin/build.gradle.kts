import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask.FailureLevel

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.intellij.platform)
    jacoco
}

group = "io.miragon"
version = providers.gradleProperty("pluginVersion").get()

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
        // JUnit5 IntelliJ test fixtures for the router tests: JUnit5 carries the
        // @TestApplication / @RunInEdt annotations + projectFixture/tempPathFixture
        // (the `…junit5` artefact), Platform carries PlatformTestUtil and the headless
        // application support they boot on. Only the router tests need them — they
        // drive a real Document/PropertiesComponent — so the version tracks the IDE
        // (no version-catalog entry) and the jars download on the first test run.
        testFramework(TestFrameworkType.JUnit5)
        testFramework(TestFrameworkType.Platform)
        // Java code-insight test fixtures: ship LightJavaCodeInsightFixtureTestCase5,
        // the JUnit5 base class the script-completion test extends to drive the real
        // completion pipeline with a properly leak-tracked light project.
        testFramework(TestFrameworkType.Plugin.Java)
    }
    // Gson does the JSON encode/decode for the host ↔ bridge ↔ webview messages.
    // Hand-built strings are unsafe here: SyncDocumentCommand carries the full
    // BPMN XML, which must round-trip through proper escaping.
    implementation(libs.gson)

    // The transport/supervisor tests stay pure-JVM: the intellijPlatform compile
    // dependency already supplies Logger + Gson on the test classpath, and the
    // seams let them inject a fake process/clock. The router tests, by contrast,
    // use the JUnit5 platform fixtures (@TestApplication) because they drive a real
    // Document/PropertiesComponent — see the testFramework dependency above.
    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        // Emit real JVM default methods instead of DefaultImpls override bridges,
        // which the plugin verifier otherwise flags as internal/experimental/
        // deprecated usages of the inherited platform defaults (e.g.
        // ToolWindowFactory.getIcon) — Marketplace-blocking false positives.
        freeCompilerArgs.add("-jvm-default=no-compatibility")
    }
}

tasks.test {
    useJUnitPlatform()
    // A new JVM per test class. The light-project code-insight test
    // (ScriptCompletionContributorTest) and the @TestApplication router tests can't
    // share a JVM: the router tests install a strict app-level project-leak tracker
    // that catches the code-insight test's light project (held by project services
    // after disposal). Isolating each class sidesteps the cross-contamination.
    setForkEvery(1)
    // Always refresh the coverage data so `jacocoTestReport` reflects the latest run.
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    // Codecov ingests the XML; the HTML report is dead weight in CI.
    reports {
        xml.required.set(true)
        html.required.set(false)
    }
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

    // Binary-compatibility verification. We build against the 242 floor but claim
    // compatibility up to the latest (untilBuild = null), so the verifier guards
    // the open upper bound: the floor catches accidental use of a post-242 API,
    // and a current release (the top of the range users actually run) catches a
    // removed/changed API the 242 build would crash on at runtime.
    pluginVerification {
        // Gate on real breakage only. Deprecated/experimental/internal usages are
        // reported but don't fail: across a 242→latest range the replacement API
        // often doesn't exist on the floor, so failing on a deprecation would make
        // every upstream deprecation an un-fixable build break. COMPATIBILITY and
        // SCHEDULED_FOR_REMOVAL are the categories that mean "will not run".
        failureLevel = listOf(
            FailureLevel.COMPATIBILITY_PROBLEMS,
            FailureLevel.SCHEDULED_FOR_REMOVAL_API_USAGES,
            FailureLevel.INVALID_PLUGIN,
        )
        ides {
            // The 242 floor still ships as the standalone Community artifact.
            create(IntelliJPlatformType.IntellijIdeaCommunity, "2024.2.5")
            // Community stopped being published as a separate artifact in 2025.3;
            // newer releases resolve through the unified IntelliJ IDEA type.
            create(IntelliJPlatformType.IntellijIdea, "2026.1.3")
        }
    }

    // Sign the distribution with our own certificate so the Marketplace can
    // verify the artefact's integrity end-to-end; without this JetBrains signs
    // the plugin itself and the chain of trust starts only at their servers.
    signing {
        certificateChain = providers.environmentVariable("CERTIFICATE_CHAIN")
        privateKey = providers.environmentVariable("PRIVATE_KEY")
        password = providers.environmentVariable("PRIVATE_KEY_PASSWORD")
    }

    publishing {
        token = providers.environmentVariable("JETBRAINS_MARKETPLACE_TOKEN")
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

// Single source of truth: the `*.bpmn.vars.json` JSON Schema lives in libs/shared
// next to the type it mirrors. Staged into resources so the JsonSchemaProviderFactory
// loads it from the classpath at `/schemas/bpmn-vars.schema.json`.
val varsSchema = layout.projectDirectory.file("../../libs/shared/src/lib/variableManifest.schema.json")

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

val copySchema =
    tasks.register<Copy>("copySchema") {
        description = "Stages the shared *.bpmn.vars.json JSON Schema into plugin resources (loaded from the classpath by the JsonSchemaProviderFactory)."
        doFirst {
            if (!varsSchema.asFile.exists()) {
                throw GradleException("Vars manifest schema not found at ${varsSchema.asFile}.")
            }
        }
        from(varsSchema) {
            rename { "bpmn-vars.schema.json" }
        }
        // Lands at `/schemas/bpmn-vars.schema.json` on the classpath.
        into(stagedResourcesRoot.map { it.dir("schemas") })
    }

// Stamp the plugin version onto the class path so BridgeBinaryResolver can key
// its extraction cache without a PluginManager lookup — every class/id→descriptor
// API is @ApiStatus.Internal and would fail Marketplace verification.
val writeBridgeVersion =
    tasks.register("writeBridgeVersion") {
        val versionFile = stagedResourcesRoot.map { it.file("bridge-version.txt") }
        val pluginVersion = version.toString()
        inputs.property("pluginVersion", pluginVersion)
        outputs.file(versionFile)
        doLast { versionFile.get().asFile.apply { parentFile.mkdirs() }.writeText(pluginVersion) }
    }

sourceSets.named("main") {
    resources.srcDir(stagedResourcesRoot)
}

tasks.named<ProcessResources>("processResources") {
    dependsOn(copyWebview, copyDeploymentWebview, copyBridge, copySchema, writeBridgeVersion)
}

// The sandbox for `runIde` is assembled from the jar, which already contains the
// staged resources, so no extra sandbox wiring is needed — but make the
// dependency explicit so a clean `runIde` always stages the bundles first.
tasks.withType<PrepareSandboxTask>().configureEach {
    dependsOn(copyWebview, copyDeploymentWebview, copyBridge, copySchema, writeBridgeVersion)
}
