/**
 * Generates docs/public/updatePlugins.xml — the JetBrains "custom plugin
 * repository" descriptor IntelliJ polls to discover and update the Miragon
 * BPMN Modeler plugin when distributed outside the Marketplace.
 *
 * Pulls metadata (name, vendor, description, since-build) from the live
 * sources of truth (plugin.xml + build.gradle.kts) so the descriptor cannot
 * drift from what the IDE actually installs. Version + download URL must be
 * passed in — they are decided by the release pipeline.
 *
 * Designed to run in GitHub Actions with Node 20+; no dependencies.
 *
 * Usage:
 *   node .github/scripts/generate-update-plugins-xml.mjs \
 *     --version 0.1.1 \
 *     --download-url https://github.com/Miragon/bpmn-modeler/releases/download/intellij-v0.1.1/bpmn-modeler-intellij-plugin-0.1.1.zip
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("../..", import.meta.url).pathname);
const PLUGIN_XML = resolve(
    REPO_ROOT,
    "apps/intellij-plugin/src/main/resources/META-INF/plugin.xml",
);
const BUILD_GRADLE = resolve(REPO_ROOT, "apps/intellij-plugin/build.gradle.kts");
const OUTPUT = resolve(REPO_ROOT, "docs/public/updatePlugins.xml");

/**
 * Parses CLI args of the form `--key value` into a plain object. Throws if a
 * required arg is missing — the script is invoked from CI and silent
 * defaulting would publish a malformed descriptor.
 *
 * @returns {{version: string, downloadUrl: string}}
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const out = {};
    for (let i = 0; i < args.length; i++) {
        const key = args[i];
        if (!key.startsWith("--")) continue;
        const value = args[i + 1];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`Missing value for argument ${key}`);
        }
        out[key.slice(2)] = value;
        i++;
    }
    if (!out.version) throw new Error("Missing --version");
    if (!out["download-url"]) throw new Error("Missing --download-url");
    return { version: out.version, downloadUrl: out["download-url"] };
}

/**
 * Reads a tag's text content from plugin.xml. The descriptor file is small
 * and well-formed by us, so a focused regex beats pulling in an XML parser.
 *
 * @param {string} xml plugin.xml content.
 * @param {string} tag Tag name (without angle brackets).
 * @returns {string} The trimmed text content.
 */
function readTagText(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`));
    if (!match) throw new Error(`Tag <${tag}> not found in plugin.xml`);
    return match[1].trim();
}

/**
 * Extracts the contents of a CDATA section (or returns the raw text if no
 * CDATA wrapper is present). Used for <description>, which is authored as
 * CDATA in plugin.xml.
 *
 * @param {string} text Raw inner text of a tag.
 * @returns {string} CDATA payload, trimmed.
 */
function unwrapCdata(text) {
    const match = text.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    return (match ? match[1] : text).trim();
}

/**
 * Reads the `sinceBuild = "NNN"` from build.gradle.kts. That literal is the
 * source of truth Gradle injects into plugin.xml via patchPluginXml, so we
 * read it here rather than re-parsing the patched jar.
 *
 * @param {string} gradle build.gradle.kts content.
 * @returns {string} The sinceBuild number (e.g. "242").
 */
function readSinceBuild(gradle) {
    const match = gradle.match(/sinceBuild\s*=\s*"(\d+)"/);
    if (!match) throw new Error('sinceBuild = "..." not found in build.gradle.kts');
    return match[1];
}

/**
 * XML-escapes the five reserved characters. The version + URL come from CI
 * inputs, so even if they only ever contain safe chars today, escaping
 * prevents a future change to the tag scheme from emitting broken XML.
 *
 * @param {string} value Raw value.
 * @returns {string} XML-attribute-safe value.
 */
function xmlEscape(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function main() {
    const { version, downloadUrl } = parseArgs();

    const pluginXml = readFileSync(PLUGIN_XML, "utf-8");
    const gradle = readFileSync(BUILD_GRADLE, "utf-8");

    const pluginId = readTagText(pluginXml, "id");
    const name = readTagText(pluginXml, "name");
    const vendor = readTagText(pluginXml, "vendor");
    const description = unwrapCdata(readTagText(pluginXml, "description"));
    const sinceBuild = readSinceBuild(gradle);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plugins>
  <plugin id="${xmlEscape(pluginId)}"
          url="${xmlEscape(downloadUrl)}"
          version="${xmlEscape(version)}">
    <idea-version since-build="${xmlEscape(sinceBuild)}"/>
    <name>${xmlEscape(name)}</name>
    <vendor>${xmlEscape(vendor)}</vendor>
    <description><![CDATA[
${description}
    ]]></description>
  </plugin>
</plugins>
`;

    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, xml, "utf-8");
    console.log(`Wrote ${OUTPUT} (version ${version}, since-build ${sinceBuild}).`);
}

main();
