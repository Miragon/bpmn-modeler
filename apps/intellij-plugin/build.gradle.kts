import org.gradle.api.tasks.testing.logging.TestExceptionFormat
import org.jetbrains.intellij.platform.gradle.IntelliJPlatformType
import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask
import org.jetbrains.intellij.platform.gradle.tasks.VerifyPluginTask.FailureLevel
import org.jetbrains.kotlin.gradle.dsl.KotlinVersion

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
        // The plugin and its tests run on the IDE's bundled Kotlin stdlib (1.9 on the 242 floor).
        // From API 2.2 the compiler nulls out spilled coroutine locals through
        // kotlin.coroutines.jvm.internal.SpillingKt, which that stdlib lacks.
        apiVersion = KotlinVersion.KOTLIN_2_1
    }
}

val protocolDescriptor = layout.projectDirectory.file("../modeler-bridge/src/protocol/domain/protocol.json")
val settingsNormalizationCases =
    layout.projectDirectory.file("../../libs/modeler-core/src/kernel/domain/settingsNormalization.cases.json")
val vscodeManifest = layout.projectDirectory.file("../vscode-plugin/package.json")
val statusViewTypes = layout.projectDirectory.file("../../libs/modeler-core/src/kernel/domain/statusView.ts")
val elementTemplateFileCases =
    layout.projectDirectory.file("../../libs/modeler-types/src/elementTemplateFile.cases.json")
val elementTemplatePreviewMessages =
    layout.projectDirectory.file("../../libs/shared/src/lib/elementTemplatePreviewMessages.cases.json")
val surfaceModes = layout.projectDirectory.file("../../libs/modeler-types/src/surfaceMode.ts")
val colorThemes = layout.projectDirectory.file("../../libs/modeler-types/src/settings.ts")
val elementIdStyles = layout.projectDirectory.file("../../libs/modeler-types/src/elementIds.ts")
val modelerSettings = layout.projectDirectory.file("../../libs/modeler-core/src/kernel/domain/modelerSettings.ts")
val modeLabels = layout.projectDirectory.file("../../packages/bpmn-modeler/src/modeSession/modeStrip.ts")
val emptyDmn = layout.projectDirectory.file("../../libs/modeler-types/src/emptyDmn.ts")
val scriptCompletionCases =
    layout.projectDirectory.file("../../libs/modeler-core/src/scriptTask/domain/scriptCompletion.cases.json")
val scriptCompletionDetail =
    layout.projectDirectory.file("../../libs/modeler-core/src/scriptTask/domain/scriptCompletionDetail.ts")
val newModelFilePrompt = layout.projectDirectory.file("../../libs/modeler-core/src/modeler/domain/newModelFilePrompt.ts")
val pluginAssetUrlCases =
    layout.projectDirectory.file("../../apps/modeler-bridge/src/editorSession/domain/pluginAssetUrl.cases.json")
val actionNoticeTypes = layout.projectDirectory.file("../../libs/modeler-core/src/kernel/domain/actionNotice.ts")
val codeApprovalChangeCases =
    layout.projectDirectory.file("../../libs/modeler-core/src/kernel/domain/codeApprovalChange.cases.json")
val templatePreferenceChangeCases =
    layout.projectDirectory.file("../../libs/modeler-core/src/kernel/domain/templatePreferenceChange.cases.json")
val projectScopes = layout.projectDirectory.file("../../libs/modeler-core/src/kernel/domain/projectScopes.ts")
val brandModeCases = layout.projectDirectory.file("../../libs/shared/src/lib/brandMode.cases.json")
val documentFlushReplyCases =
    layout.projectDirectory.file("../../libs/shared/src/lib/documentFlushReply.cases.json")
val intellijPasswordSafeCases =
    layout.projectDirectory.file("../modeler-bridge/src/__fixtures__/intellijPasswordSafe.cases.json")
val intellijDocumentWriteCases =
    layout.projectDirectory.file("../modeler-bridge/src/__fixtures__/intellijDocumentWrite.cases.json")
val intellijScriptTabsCases =
    layout.projectDirectory.file("../modeler-bridge/src/__fixtures__/intellijScriptTabs.cases.json")
val intellijProgressCases =
    layout.projectDirectory.file("../modeler-bridge/src/__fixtures__/intellijProgress.cases.json")
val intellijWritableScopes =
    layout.projectDirectory.file("../modeler-bridge/src/__fixtures__/intellijWritableScopes.json")

tasks.test {
    useJUnitPlatform()
    // The tests read these TypeScript-side files: ProtocolHandlerCoverageTest the bridge's
    // protocol descriptor, ModelerSettingsStoreTest the core's settings rows, the VS Code
    // manifest's defaults under the core's snapshot names, the surface modes, the colour themes
    // and the ID styles, ModelerLocalesTest the manifest's languages,
    // ModelerSettingsConfigurableTest the manifest's default modes and ID styles and the mode
    // strip's labels, StatusSlotPlacementTest the core's status slots and view values,
    // ElementTemplateFilesTest the rows the TypeScript template rule runs,
    // ElementTemplatePreviewMessagesTest the preview page's messages, EmptyDmnDiagramTest the
    // shared DMN scaffold, NewModelFileDialogTest the core's new-file dialog texts,
    // ScriptCompletionMatchersTest the rows the core's script-completion matchers run,
    // ScriptCompletionDetailTest the core's label for an untyped variable, WebviewRouteTest the
    // plugin asset urls the bridge builds, ActionNoticeToneTest the core's notice tones,
    // PluginApprovalStoreTest the rows the core merges approval changes
    // by, TemplatePreferenceStoreTest the rows it merges template switch changes by, ProjectScopeTest
    // the core's project scopes, BrandModeTest the rows the shared brand mode rule runs,
    // DocumentFlushedReplyParseTest the rows the shared flush reply table runs, and
    // SecretStoreRouterTest, EditorSessionRouterTest, ScriptRouterTest, HostUiRouterTest and
    // MarketplaceRouterTest the rows and values the bridge's IntelliJ loopbacks answer with. As
    // declared inputs, a change on the TypeScript side alone reruns the tests instead of restoring
    // them from the build cache.
    mapOf(
        "protocolDescriptor" to protocolDescriptor,
        "settingsNormalizationCases" to settingsNormalizationCases,
        "vscodeManifest" to vscodeManifest,
        "statusViewTypes" to statusViewTypes,
        "elementTemplateFileCases" to elementTemplateFileCases,
        "elementTemplatePreviewMessages" to elementTemplatePreviewMessages,
        "surfaceModes" to surfaceModes,
        "colorThemes" to colorThemes,
        "elementIdStyles" to elementIdStyles,
        "modelerSettings" to modelerSettings,
        "modeLabels" to modeLabels,
        "emptyDmn" to emptyDmn,
        "newModelFilePrompt" to newModelFilePrompt,
        "scriptCompletionCases" to scriptCompletionCases,
        "scriptCompletionDetail" to scriptCompletionDetail,
        "pluginAssetUrlCases" to pluginAssetUrlCases,
        "actionNoticeTypes" to actionNoticeTypes,
        "codeApprovalChangeCases" to codeApprovalChangeCases,
        "templatePreferenceChangeCases" to templatePreferenceChangeCases,
        "projectScopes" to projectScopes,
        "brandModeCases" to brandModeCases,
        "documentFlushReplyCases" to documentFlushReplyCases,
        "intellijPasswordSafeCases" to intellijPasswordSafeCases,
        "intellijDocumentWriteCases" to intellijDocumentWriteCases,
        "intellijScriptTabsCases" to intellijScriptTabsCases,
        "intellijProgressCases" to intellijProgressCases,
        "intellijWritableScopes" to intellijWritableScopes,
    ).forEach { (name, file) ->
        inputs.file(file).withPropertyName(name).withPathSensitivity(PathSensitivity.RELATIVE)
        systemProperty("miragon.$name", file.asFile.absolutePath)
    }
    // A new JVM per test class. The light-project code-insight test
    // (ScriptCompletionContributorTest) and the @TestApplication router tests can't
    // share a JVM: the router tests install a strict app-level project-leak tracker
    // that catches the code-insight test's light project (held by project services
    // after disposal). Isolating each class sidesteps the cross-contamination.
    setForkEvery(1)
    // The leak tracker's message carries the reference path; the short format drops it.
    testLogging { exceptionFormat = TestExceptionFormat.FULL }
    extensions.configure<JacocoTaskExtension> {
        // The platform's PathClassLoader defines the plugin classes without a
        // CodeSource, which jacoco skips by default — leaving the report at 0%.
        isIncludeNoLocationClasses = true
        excludes = listOf("jdk.internal.*")
    }
    // Always refresh the coverage data so `jacocoTestReport` reflects the latest run.
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
}

// About three points below the measured baseline, like the Vitest workspace thresholds.
tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.test)
    violationRules {
        rule {
            limit {
                counter = "LINE"
                minimum = "0.37".toBigDecimal()
            }
            limit {
                counter = "BRANCH"
                minimum = "0.27".toBigDecimal()
            }
        }
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
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

// The webview bundles (bpmn, deployment and add-ons) and the modeler-core bridge
// binary are pre-built by the yarn workspace (`corepack yarn build:bpmn-webview`,
// `build:deployment-webview`, `build:add-ons-webview`, and
// `workspace @miragon/bpmn-modeler-bridge compile`).
// This Gradle build never invokes the JS/Bun toolchain; it only packages the
// already-built artefacts so `runIde` and the distributable zip carry them. See
// apps/modeler-bridge/README.md.
val webviewDist = layout.projectDirectory.dir("../../dist/webview-staging/bpmn-webview")
val deploymentWebviewDist =
    layout.projectDirectory.dir("../../dist/webview-staging/deployment-webview")
val addOnsWebviewDist = layout.projectDirectory.dir("../../dist/webview-staging/add-ons-webview")
val bridgeBinary = layout.projectDirectory.file("../../apps/modeler-bridge/dist/modeler-bridge")
val bridgeDistRoot = layout.projectDirectory.dir("../../apps/modeler-bridge/dist")
val stagedResourcesRoot = layout.buildDirectory.dir("modeler-resources")

// Single source of truth: the `deployment-targets.json` JSON Schema lives in
// libs/shared next to the type it mirrors. Staged into resources so the
// JsonSchemaProviderFactory loads it from the classpath at
// `/schemas/deployment-targets.schema.json`.
val deploymentTargetsSchema =
    layout.projectDirectory.file("../../libs/shared/src/lib/deploymentTargets.schema.json")

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
    // Sync, not Copy: chunk names are content-hashed, so stale chunks would pile up in the jar.
    tasks.register<Sync>("copyWebview") {
        description = "Stages the pre-built bpmn-webview bundle into plugin resources (served from the classpath at runtime)."
        from(webviewDist)
        // Nest under `webview/` so the served classpath path is `/webview/...`.
        into(stagedResourcesRoot.map { it.dir("webview") })
    }

val copyDeploymentWebview =
    tasks.register<Copy>("copyDeploymentWebview") {
        description = "Stages the pre-built deployment-webview bundle into plugin resources (served from the classpath at runtime)."
        from(deploymentWebviewDist)
        // Nest under `webview-deployment/` so the served classpath path is `/webview-deployment/...`.
        into(stagedResourcesRoot.map { it.dir("webview-deployment") })
    }

val copyAddOnsWebview =
    // Sync, not Copy: a renamed or dropped asset, such as a font file, would otherwise stay in the jar.
    tasks.register<Sync>("copyAddOnsWebview") {
        description = "Stages the pre-built add-ons-webview bundle into plugin resources (served from the classpath at runtime)."
        from(addOnsWebviewDist) { exclude("licenses/**") }
        // Nest under `webview-add-ons/` so the served classpath path is `/webview-add-ons/...`.
        into(stagedResourcesRoot.map { it.dir("webview-add-ons") })
    }

// The add-ons build emits the licenses of the fonts (OFL-1.1) and icons (ISC) it bundles.
val addOnsLicensesDist = addOnsWebviewDist.dir("licenses")
val thirdPartyLicenses =
    listOf("geist.LICENSE", "geist-mono.LICENSE", "lucide.LICENSE").map { addOnsLicensesDist.file(it) }

val copyThirdPartyLicenses =
    tasks.register<Sync>("copyThirdPartyLicenses") {
        description = "Stages the licenses of the third-party code the webview bundles ship into plugin resources."
        from(addOnsLicensesDist)
        into(stagedResourcesRoot.map { it.dir("META-INF/licenses") })
    }

val copyBridge =
    tasks.register<Copy>("copyBridge") {
        description = "Stages the pre-built Node-free modeler-core bridge binary(ies) into plugin resources (extracted and spawned at runtime)."
        if (bundleAllPlatforms) {
            releaseBridgeTargets.forEach { (platformDir, binaryName) ->
                from(bridgeDistRoot.file("$platformDir/$binaryName")) {
                    // Preserve the source filename (`.exe` for windows) so the
                    // runtime resolver finds the right artefact per platform.
                    into("bin/$platformDir")
                }
            }
            into(stagedResourcesRoot)
        } else {
            from(bridgeBinary)
            // Lands at `/bin/<os>-<arch>/modeler-bridge` on the classpath (CoreProcess reads it there).
            into(stagedResourcesRoot.map { it.dir("bin/${hostPlatformDir()}") })
        }
    }

val copySchema =
    tasks.register<Copy>("copySchema") {
        description = "Stages the shared deployment-targets.json JSON Schema into plugin resources (loaded from the classpath by the JsonSchemaProviderFactory)."
        from(deploymentTargetsSchema) {
            rename { "deployment-targets.schema.json" }
        }
        // Lands at `/schemas/<name>.schema.json` on the classpath.
        into(stagedResourcesRoot.map { it.dir("schemas") })
    }

// A copy task whose source is missing is skipped as NO-SOURCE before any
// doFirst runs, so it cannot fail on a bundle nobody built. A local build then
// shows a blank tab; a release build checks every source here instead.
val verifyReleaseBundles =
    tasks.register("verifyReleaseBundles") {
        description = "Fails a release build whose webview bundles, their licenses or bridge binaries are missing."
        val buildBridges = "corepack yarn workspace @miragon/bpmn-modeler-bridge compile:all"
        val required =
            listOf(
                webviewDist.file("index.js").asFile to "corepack yarn build:bpmn-webview",
                deploymentWebviewDist.file("index.js").asFile to "corepack yarn build:deployment-webview",
                addOnsWebviewDist.file("index.js").asFile to "corepack yarn build:add-ons-webview",
                // Without it the tab ships unstyled and nothing fails.
                addOnsWebviewDist.file("index.css").asFile to "corepack yarn build:add-ons-webview",
            ) + thirdPartyLicenses.map { it.asFile to "corepack yarn build:add-ons-webview" } +
                releaseBridgeTargets.map { (dir, name) -> bridgeDistRoot.file("$dir/$name").asFile to buildBridges }
        doLast {
            val missing = required.filterNot { (file, _) -> file.exists() }
            if (missing.isNotEmpty()) {
                throw GradleException(
                    missing.joinToString("\n") { (file, command) -> "Missing $file: run `$command` from the repo root." },
                )
            }
        }
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
    dependsOn(copyWebview, copyDeploymentWebview, copyAddOnsWebview, copyThirdPartyLicenses, copyBridge, copySchema, writeBridgeVersion)
    if (bundleAllPlatforms) dependsOn(verifyReleaseBundles)
}

// The sandbox for `runIde` is assembled from the jar, which already contains the
// staged resources, so no extra sandbox wiring is needed — but make the
// dependency explicit so a clean `runIde` always stages the bundles first.
tasks.withType<PrepareSandboxTask>().configureEach {
    dependsOn(copyWebview, copyDeploymentWebview, copyAddOnsWebview, copyThirdPartyLicenses, copyBridge, copySchema, writeBridgeVersion)
}
