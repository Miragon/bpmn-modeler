// The kernel takes its bpmn-js base as a value, so a client that builds only viewer surfaces
// must bundle no Modeler and no feature: this builds such a client and reads its module graph.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PACKAGE_DIR, "../..");
const CREATE_SURFACE = join(PACKAGE_DIR, "src/composition/createSurface.ts");

const MODELER_MODULES = ["/bpmn-js/lib/Modeler.js", "/bpmn-js/lib/BaseModeler.js"];
// The prebuilt bundles hold the whole Modeler in one module.
const PREBUILT_MODELER = "/bpmn-js/dist/bpmn-modeler";
const FEATURE_LIBRARY_KIND = "diagram-js";
// What a viewer surface may reach in the package: the kernel, the factory that builds it and its defaults.
const KERNEL_FOLDER = "kernel";
const KERNEL_COMPOSITION = ["composition/createSurface.ts", "composition/kernelDefaults.ts"];

const ENTRY_ID = "viewer-surface-entry";
const RESOLVED_ENTRY_ID = `\0${ENTRY_ID}`;

export function viewerSurfaceEntry(base = "bpmn-js/lib/NavigatedViewer") {
    return [
        `import Base from ${JSON.stringify(base)};`,
        `import { createSurface } from ${JSON.stringify(CREATE_SURFACE)};`,
        "export const open = (container) => createSurface(container, { base: Base, features: [] });",
    ].join("\n");
}

const posix = (path) => path.split(sep).join("/");

/** The source folders of the workspace libraries that hold diagram-js features. */
export function featureLibraryDirs(repoRoot = REPO_ROOT) {
    const libs = join(repoRoot, "libs");
    return readdirSync(libs, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => {
            try {
                const manifest = JSON.parse(
                    readFileSync(join(libs, entry.name, "package.json"), "utf8"),
                );
                return manifest.architecture === FEATURE_LIBRARY_KIND;
            } catch {
                return false;
            }
        })
        .map((entry) => `${posix(join(libs, entry.name))}/`);
}

function packagePathOf(id, packageDir) {
    const source = `${posix(join(packageDir, "src"))}/`;
    return id.startsWith(source) ? id.slice(source.length) : undefined;
}

function isKernelPath(path) {
    return path.startsWith(`${KERNEL_FOLDER}/`) || KERNEL_COMPOSITION.includes(path);
}

/**
 * The module ids of a viewer-surface bundle that do not belong there: the
 * Modeler, a feature library, or a package file outside the kernel and its factory.
 */
export function modulesOutsideViewerSurface(
    moduleIds,
    { featureDirs = featureLibraryDirs(), packageDir = PACKAGE_DIR } = {},
) {
    return moduleIds.map(posix).filter((id) => {
        if (MODELER_MODULES.some((suffix) => id.endsWith(suffix))) return true;
        if (id.includes(PREBUILT_MODELER)) return true;
        if (featureDirs.some((dir) => id.startsWith(dir))) return true;
        const path = packagePathOf(id, packageDir);
        return path !== undefined && !isKernelPath(path);
    });
}

/** What a viewer-surface bundle must hold, or the check no longer reads this bundler's output. */
export function missingViewerSurfaceControls(moduleIds, { packageDir = PACKAGE_DIR } = {}) {
    const ids = moduleIds.map(posix);
    const required = [
        "/bpmn-js/lib/NavigatedViewer.js",
        `${posix(join(packageDir, "src/kernel/service/kernelSurface.ts"))}`,
        `${posix(join(packageDir, "src/kernel/adapter/in/keyboardFocusModule.ts"))}`,
    ];
    return required.filter((suffix) => !ids.some((id) => id.endsWith(suffix)));
}

function entryPlugin(code) {
    return {
        name: ENTRY_ID,
        resolveId: (id) => (id === ENTRY_ID ? RESOLVED_ENTRY_ID : undefined),
        load: (id) => (id === RESOLVED_ENTRY_ID ? code : undefined),
    };
}

/** Every module id the bundle of `code` holds, lazy chunks included. */
export async function bundledModuleIds(code) {
    const { build } = await import("vite");
    const result = await build({
        configFile: false,
        root: PACKAGE_DIR,
        logLevel: "silent",
        resolve: { tsconfigPaths: true },
        plugins: [entryPlugin(code)],
        build: {
            write: false,
            minify: false,
            emptyOutDir: false,
            // An app build drops an unused entry's exports, and with them the graph under test.
            rollupOptions: { input: ENTRY_ID, preserveEntrySignatures: "exports-only" },
        },
    });
    const outputs = Array.isArray(result) ? result : [result];
    return outputs
        .flatMap(({ output }) => output)
        .filter((chunk) => chunk.type === "chunk")
        .flatMap((chunk) => chunk.moduleIds)
        .filter((id) => !id.startsWith("\0"));
}

export async function checkViewerSurfaceBundle({ code = viewerSurfaceEntry() } = {}) {
    const moduleIds = await bundledModuleIds(code);
    const missing = missingViewerSurfaceControls(moduleIds);
    if (missing.length > 0) {
        throw new Error(
            `the viewer-surface bundle holds none of ${missing.join(", ")}, so this check no ` +
                "longer reads the bundler's output; update its signal.",
        );
    }
    const offenders = modulesOutsideViewerSurface(moduleIds);
    if (offenders.length > 0) {
        throw new Error(
            "a client that builds only viewer surfaces through createSurface bundles:\n  " +
                offenders.map((id) => relative(REPO_ROOT, id)).join("\n  "),
        );
    }
    return { modules: moduleIds.length };
}

function isMain() {
    return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
    try {
        const { modules } = await checkViewerSurfaceBundle();
        console.log(
            `check-viewer-surface-bundle: a viewer-only createSurface bundle (${modules} modules) holds no Modeler and no feature.`,
        );
    } catch (error) {
        console.error(`check-viewer-surface-bundle: ${error.message}`);
        process.exitCode = 1;
    }
}
