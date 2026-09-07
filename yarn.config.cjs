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
// silently letting one win. Peer dependencies are exempt: they are deliberately
// wide ranges, not install pins.
//
// Check with `yarn constraints`; auto-align with `yarn constraints --fix`.
const PACKAGES = ["@miragon/bpmn-modeler", "@miragon/dmn-modeler"];

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
                if (dep.type === "peerDependencies") continue;
                dep.update(range);
            }
        }
    },
};
