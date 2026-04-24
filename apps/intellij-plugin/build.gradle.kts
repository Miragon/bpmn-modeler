plugins {
    kotlin("jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform") version "2.1.0"
}

group = providers.gradleProperty("pluginGroup").get()
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        create(
            providers.gradleProperty("platformType").get(),
            providers.gradleProperty("platformVersion").get(),
        )
        instrumentationTools()
    }
}

kotlin {
    jvmToolchain(17)
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = providers.gradleProperty("pluginSinceBuild")
            // Declare no upper bound: an empty gradle property → empty
            // `until-build` attribute, which IntelliJ treats as "any future
            // version". Keeps the plugin loadable across IDE upgrades.
            untilBuild = provider { null }
        }
    }
}

/**
 * Copies the pre-built bpmn-modeler CLI (apps/modeler-cli/dist) into the
 * plugin resources so it ends up inside the JAR. Must run before
 * processResources. The root yarn build handles CLI compilation; this
 * task just stages the output.
 */
val copyCli by tasks.registering(Copy::class) {
    from(layout.projectDirectory.dir("../modeler-cli/dist"))
    into(layout.projectDirectory.dir("src/main/resources/cli"))
    doFirst {
        val source = layout.projectDirectory.dir("../modeler-cli/dist").asFile
        check(source.exists()) {
            "Missing CLI build output at $source. " +
                "Run 'corepack yarn build:modeler-cli' before building the plugin."
        }
    }
}

tasks.named("processResources") {
    dependsOn(copyCli)
}

tasks.withType<JavaCompile>().configureEach {
    sourceCompatibility = "17"
    targetCompatibility = "17"
}
