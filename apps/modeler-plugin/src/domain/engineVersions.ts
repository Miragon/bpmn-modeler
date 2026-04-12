/**
 * Hardcoded engine version registry for Camunda 7 and 8.
 *
 * Camunda 7 is end-of-life so this list is fixed.
 * Camunda 8 versions should be updated with each plugin release.
 */

/** Available Camunda 7 versions (EOL — no new versions expected). */
export const C7_VERSIONS: readonly string[] = [
    "7.24.0",
    "7.23.0",
    "7.22.0",
    "7.21.0",
    "7.20.0",
    "7.19.0",
    "7.18.0",
    "7.17.0",
];

/** Available Camunda 8 versions (update with each plugin release). */
export const C8_VERSIONS: readonly string[] = [
    "8.9.0",
    "8.8.0",
    "8.7.0",
    "8.6.0",
    "8.5.0",
    "8.4.0",
    "8.3.0",
    "8.2.0",
    "8.1.0",
    "8.0.0",
];

/**
 * Returns the latest (first) version for the given platform.
 *
 * @param platform The execution platform identifier.
 * @returns The latest version string for that platform.
 */
export function getLatestVersion(platform: "c7" | "c8"): string {
    return getVersions(platform)[0];
}

/**
 * Returns the version list for the given platform.
 *
 * @param platform The execution platform identifier.
 * @returns An ordered list of version strings (newest first).
 */
export function getVersions(platform: "c7" | "c8"): readonly string[] {
    return platform === "c7" ? C7_VERSIONS : C8_VERSIONS;
}
