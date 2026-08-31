// Version-skew guard (issue #1379): the published @miragon/bpmn-modeler ships
// the bpmn-io stack as real `dependencies`, but the same libraries are also
// declared by the in-repo consumers (bpmn-webview and the private feature libs)
// that bundle the package from source. If a consumer bumps, say, `bpmn-js` and
// the package does not, the webview and the npm tarball drift onto two copies —
// the classic "works in the monorepo, breaks for installers" split.
//
// This constraint forces every workspace that declares a name listed in the
// package's `dependencies` onto the package's exact pin. Peer dependencies are
// exempt: they are deliberately wide ranges, not install pins.
//
// Check with `yarn constraints`; auto-align with `yarn constraints --fix`.
module.exports = {
    async constraints({ Yarn }) {
        const modeler = Yarn.workspace({ ident: "@miragon/bpmn-modeler" });
        for (const pin of Yarn.dependencies({ workspace: modeler })) {
            if (pin.type !== "dependencies") continue;
            for (const dep of Yarn.dependencies({ ident: pin.ident })) {
                if (dep.type === "peerDependencies") continue;
                dep.update(pin.range);
            }
        }
    },
};
