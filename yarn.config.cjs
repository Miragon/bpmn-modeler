// Version-skew guard (issue #1379): the published @miragon/bpmn-modeler and
// @miragon/dmn-modeler ship the bpmn-io stack as real `dependencies`, but the
// same libraries are also declared by the in-repo consumers (the webviews and
// the private feature libs) that bundle the packages from source. If a consumer
// bumps, say, `diagram-js` and a package does not, the webview and the npm
// tarball drift onto two copies — the classic "works in the monorepo, breaks for
// installers" split.
//
// This constraint forces every workspace that declares a name listed in either
// package's `dependencies` onto that package's exact pin. When both packages pin
// the *same* dependency at *different* ranges there is no single truth to follow,
// so each of those pins is flagged as an error to be resolved by hand instead of
// silently letting one win. Peer dependencies follow the same pin unless the
// pair is listed in PEER_PIN_EXCEPTIONS below with a reason.
//
// Check with `yarn constraints`; auto-align with `yarn constraints --fix`.
const PACKAGES = ["@miragon/bpmn-modeler", "@miragon/dmn-modeler"];

// Peers that deliberately diverge from the package pin.
// Key: "<workspace ident> → <dependency ident>", value: the reason.
const PEER_PIN_EXCEPTIONS = new Map([]);

// A patch in the root `resolutions` overrides every declared range, so a bump
// would silently keep shipping the old patched version. Fail until the patch is
// regenerated for the new version or dropped in the same change.
const PATCHED_RESOLUTION = /^patch:(.+)@npm%3A([^#]+)#/;

function constrainPatchedVersions(Yarn) {
    const rootManifest = Yarn.workspace({ cwd: "." }).manifest;
    for (const resolution of Object.values(rootManifest.resolutions ?? {})) {
        const patched = PATCHED_RESOLUTION.exec(resolution);
        if (!patched) continue;
        const [, ident, patchedVersion] = patched;
        for (const dep of Yarn.dependencies({ ident })) {
            if (dep.range === patchedVersion) continue;
            dep.error(
                `${ident} is patched at ${patchedVersion} in the root resolutions; ` +
                    `regenerate or drop the patch in the same PR that moves it to ${dep.range}.`,
            );
        }
    }
}

// These packages carry identity — instanceof checks, moddle registries, DI
// modules, preact contexts — so a stale transitive lock entry that nests a second
// copy splits one modeler across two versions.
const SINGLE_VERSION_PACKAGES = [
    "bpmn-js",
    "diagram-js",
    "bpmn-moddle",
    "moddle",
    "@bpmn-io/properties-panel",
    "bpmn-js-properties-panel",
    "bpmn-js-element-templates",
    "bpmn-js-create-append-anything",
];

// Yarn 4 never populates the `Yarn.packages()` index, so walk the resolved graph
// from the workspace dependencies instead.
function collectResolvedVersions(Yarn) {
    const versionsByIdent = new Map();
    const visited = new Set();
    const pending = Yarn.dependencies()
        .map((dependency) => dependency.resolution)
        .filter(Boolean);
    while (pending.length > 0) {
        const pkg = pending.pop();
        if (visited.has(pkg)) continue;
        visited.add(pkg);
        if (!versionsByIdent.has(pkg.ident)) versionsByIdent.set(pkg.ident, new Set());
        versionsByIdent.get(pkg.ident).add(pkg.version);
        pending.push(...pkg.dependencies.values());
    }
    return versionsByIdent;
}

function constrainSingleResolvedVersion(Yarn) {
    const rootWorkspace = Yarn.workspace({ cwd: "." });
    const versionsByIdent = collectResolvedVersions(Yarn);
    for (const ident of SINGLE_VERSION_PACKAGES) {
        const versions = versionsByIdent.get(ident) ?? new Set();
        if (versions.size <= 1) continue;
        rootWorkspace.error(
            `${ident} resolves to ${versions.size} versions (${[...versions].join(", ")}); ` +
                `run \`yarn dedupe ${ident}\`, or add a root resolution if the ranges don't overlap.`,
        );
    }
}

module.exports = {
    async constraints({ Yarn }) {
        // ident → [{ range, from, pin }] across the publishable packages.
        const pinsByIdent = new Map();
        for (const name of PACKAGES) {
            const workspace = Yarn.workspace({ ident: name });
            if (!workspace) continue;
            for (const pin of Yarn.dependencies({ workspace })) {
                if (pin.type !== "dependencies") continue;
                if (!pinsByIdent.has(pin.ident)) pinsByIdent.set(pin.ident, []);
                pinsByIdent.get(pin.ident).push({ range: pin.range, from: name, pin });
            }
        }

        for (const [ident, sources] of pinsByIdent) {
            const ranges = new Set(sources.map((source) => source.range));
            if (ranges.size > 1) {
                // Both packages pin the same dependency at conflicting ranges —
                // no single truth for other workspaces to follow. Flag each pin.
                const conflict = sources.map((s) => `${s.from} → ${s.range}`).join(", ");
                for (const source of sources) {
                    source.pin.error(
                        `Shared dependency ${ident} is pinned at conflicting ranges ` +
                            `(${conflict}); align the packages before other workspaces can follow.`,
                    );
                }
                continue;
            }
            const [range] = ranges;
            for (const dep of Yarn.dependencies({ ident })) {
                if (
                    dep.type === "peerDependencies" &&
                    PEER_PIN_EXCEPTIONS.has(`${dep.workspace.ident} → ${dep.ident}`)
                )
                    continue;
                dep.update(range);
            }
        }

        constrainPatchedVersions(Yarn);
        constrainSingleResolvedVersion(Yarn);
    },
};
