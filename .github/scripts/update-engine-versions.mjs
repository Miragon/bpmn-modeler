/**
 * Fetches the latest stable Camunda 8 releases from GitHub and updates the
 * C8_VERSIONS array in engineVersions.ts if new minor versions are found.
 *
 * Designed to run in GitHub Actions with Node 20+.
 * Uses native fetch() — no external dependencies required.
 *
 * Outputs (via $GITHUB_OUTPUT):
 *   has_changes  — "true" if the file was modified, "false" otherwise
 *   summary      — human-readable description of added versions
 */

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const GITHUB_REPO = "camunda/camunda";
const VERSION_FILE = "apps/modeler-plugin/src/domain/engineVersions.ts";

/**
 * Fetches all stable Camunda 8 minor versions from the GitHub Releases API.
 *
 * Paginates through all pages and filters out pre-releases, drafts, alpha/RC
 * builds, and optimise-only tags. Extracts the unique minor versions and
 * returns them as `8.X.0` strings (the convention used by executionPlatformVersion).
 *
 * @returns {Promise<string[]>} Unique minor version strings (newest first).
 */
async function fetchStableC8Releases() {
    const minorVersions = new Set();
    let page = 1;

    while (true) {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100&page=${page}`;
        const headers = { Accept: "application/vnd.github+json" };

        // Use GITHUB_TOKEN if available to avoid rate limits.
        if (process.env.GITHUB_TOKEN) {
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }

        const res = await fetch(url, { headers });

        if (!res.ok) {
            throw new Error(`GitHub API returned ${res.status}: ${await res.text()}`);
        }

        const releases = await res.json();
        if (releases.length === 0) break;

        for (const release of releases) {
            if (release.prerelease || release.draft) continue;

            const tag = release.tag_name.replace(/^v/, "");

            // Match stable Camunda 8 releases: 8.X.Y with no suffix
            // (excludes alpha, rc, optimize, etc.).
            const match = tag.match(/^8\.(\d+)\.\d+$/);
            if (match) {
                minorVersions.add(parseInt(match[1], 10));
            }
        }

        page++;
    }

    // Convert minor numbers to 8.X.0 strings, sorted descending.
    return [...minorVersions].sort((a, b) => b - a).map((minor) => `8.${minor}.0`);
}

/**
 * Parses the C8_VERSIONS array from the engineVersions.ts file content.
 *
 * @param {string} content The file content.
 * @returns {string[]} The currently listed version strings.
 */
function parseCurrentVersions(content) {
    const match = content.match(/C8_VERSIONS:\s*readonly\s*string\[\]\s*=\s*\[([\s\S]*?)\];/);
    if (!match) {
        throw new Error("Could not find C8_VERSIONS array in engineVersions.ts");
    }

    return [...match[1].matchAll(/"(\d+\.\d+\.\d+)"/g)].map((m) => m[1]);
}

/**
 * Rebuilds the C8_VERSIONS array literal from a list of version strings.
 *
 * @param {string[]} versions Ordered version strings (newest first).
 * @returns {string} The formatted array content (indented entries).
 */
function formatVersionArray(versions) {
    return versions.map((v) => `    "${v}",`).join("\n");
}

/**
 * Writes a key=value pair to $GITHUB_OUTPUT (or logs to stderr if not in CI).
 *
 * @param {string} key   Output variable name.
 * @param {string} value Output variable value.
 */
function setOutput(key, value) {
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
    console.log(`::set-output ${key}=${value}`);
}

async function main() {
    const filePath = resolve(VERSION_FILE);

    console.log(`Fetching stable releases from ${GITHUB_REPO}…`);
    const remoteVersions = await fetchStableC8Releases();
    console.log(`Found ${remoteVersions.length} stable 8.x minor versions on GitHub.`);

    const content = readFileSync(filePath, "utf-8");
    const currentVersions = parseCurrentVersions(content);
    console.log(`Current C8_VERSIONS: [${currentVersions.join(", ")}]`);

    const currentSet = new Set(currentVersions);
    const newVersions = remoteVersions.filter((v) => !currentSet.has(v));

    if (newVersions.length === 0) {
        console.log("No new versions to add.");
        setOutput("has_changes", "false");
        setOutput("summary", "");
        return;
    }

    console.log(`New versions to add: [${newVersions.join(", ")}]`);

    // Merge and sort all versions descending by minor.
    const merged = [...new Set([...remoteVersions, ...currentVersions])];
    merged.sort((a, b) => {
        const minorA = parseInt(a.split(".")[1], 10);
        const minorB = parseInt(b.split(".")[1], 10);
        return minorB - minorA;
    });

    const updatedArray = formatVersionArray(merged);
    const updatedContent = content.replace(
        /(C8_VERSIONS:\s*readonly\s*string\[\]\s*=\s*\[)\n[\s\S]*?(\];)/,
        `$1\n${updatedArray}\n$2`,
    );

    writeFileSync(filePath, updatedContent, "utf-8");
    console.log("engineVersions.ts updated successfully.");

    const summary = `Add Camunda 8 version(s): ${newVersions.join(", ")}`;
    setOutput("has_changes", "true");
    setOutput("summary", summary);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
