/*
 * Browser-side DMN harvest driver. Paste into the dmn-webview dev page console
 * (yarn workspace @miragon/dmn-modeler-webview serve) — or run via Playwright
 * `browser_evaluate` — after a DMN diagram with at least one decision table has
 * loaded. It relies on the dev-only recorder wired per view in
 * apps/dmn-webview/src/main.ts, which exposes `window.__injector` (the
 * last-initialised view's DI container) and `window.__harvested` (the shared Set
 * of every template passed to translate()).
 *
 * dmn-js is a multi-view Manager: each view (DRD, decision table, literal
 * expression, boxed expression) is its own diagram-js/inferno app. The recorder
 * on any view exposes that view's injector; `injector.get("_parent")` is the
 * shared Manager, which owns `getViews()` / `open(view)`. This driver walks every
 * view, opening each and exercising its surfaces so the labels render and land in
 * `window.__harvested`.
 *
 * When it settles, copy `JSON.stringify([...window.__harvested].sort())` into
 * tools/harvested-dmn.json (under the {note,count,keys} wrapper) and run
 * tools/build-overlay.mjs --write. See tools/README.md.
 *
 * Coverage is deliberately broad but not proven-exhaustive; build-overlay only
 * drops keys whose modern form was actually harvested, so gaps here shrink the
 * pruning, never cause a regression.
 */
/* global window, document, setTimeout */
window.__harvestDrainDmn = async function harvestDrainDmn() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const guard = (fn) => {
        try {
            return fn();
        } catch {
            /* keep draining */
        }
    };

    const manager = window.__injector.get("_parent");
    const views = manager.getViews();

    // Expand every properties-panel / collapsible group so labels render — the
    // panel translates during render, not at getGroups() time (as in the BPMN
    // drain). Also clicks any dmn-js collapsible headers (decision-table
    // annotations, DRD groups).
    const expandPanels = async () => {
        for (let pass = 0; pass < 10; pass++) {
            const headers = [...document.querySelectorAll(".bio-properties-panel-group-header")];
            let clicked = 0;
            for (const h of headers) {
                const entries = h.parentElement?.querySelector(
                    ".bio-properties-panel-group-entries",
                );
                if (entries && !entries.classList.contains("open")) {
                    h.click();
                    clicked++;
                }
            }
            await sleep(45);
            if (!clicked) break;
        }
        for (const li of document.querySelectorAll(
            ".bio-properties-panel-collapsible-entry-header",
        )) {
            guard(() => li.click());
        }
    };

    // ── DRD view ─────────────────────────────────────────────────────────────
    const drainDrd = async (viewer) => {
        const inj = viewer.get.bind(viewer);
        const er = inj("elementRegistry");
        const selection = inj("selection");
        const palette = guard(() => inj("palette"));
        const contextPad = guard(() => inj("contextPad"));
        const popupMenu = guard(() => inj("popupMenu"));

        guard(() => palette?.getEntries?.());

        const elements = er.getAll().filter((e) => e.type !== "label" && e.parent);
        for (const el of elements) {
            guard(() => contextPad?.getEntries?.(el));
            guard(() => selection.select(el));
            await sleep(60);
            await expandPanels();
            for (const provider of ["dmn-replace", "dmn-create"]) {
                guard(() => {
                    if (popupMenu?.isEmpty?.(el, provider) === false) {
                        popupMenu.open(el, provider, { x: 200, y: 200 });
                        popupMenu.close();
                    }
                });
            }
        }
    };

    // ── Decision-table view ──────────────────────────────────────────────────
    const drainDecisionTable = async (viewer) => {
        const inj = viewer.get.bind(viewer);
        const sheet = guard(() => inj("sheet"));
        const editorActions = guard(() => inj("editorActions"));
        const contextMenu = guard(() => inj("contextMenu"));

        // Add a rule / input / output so their controls and menu entries render.
        for (const action of ["addRule", "addInput", "addOutput"]) {
            guard(() => editorActions?.trigger?.(action));
            await sleep(60);
        }

        // Open the cell context menu on the first rule cell, an input header and
        // an output header so their entries (add/remove rule, add/remove
        // column, …) render.
        const openContextMenu = (selector) =>
            guard(() => {
                const cell = document.querySelector(selector);
                if (!cell) return;
                const rect = cell.getBoundingClientRect();
                contextMenu?.open?.(
                    { x: rect.left + 4, y: rect.top + 4 },
                    { contextMenuType: "context-menu" },
                );
            });
        openContextMenu("[data-element-id] .rule-index, .dmn-decision-table-container td");
        openContextMenu(".input-cell, th.input-cell");
        openContextMenu(".output-cell, th.output-cell");
        guard(() => contextMenu?.close?.());

        // Click the hit-policy control and the editable header cells so the
        // hit-policy dropdown, type-ref and expression-language editors render.
        for (const selector of [
            ".hit-policy",
            ".dmn-icon-edit",
            ".input-editor",
            ".output-editor",
            "th.input-cell",
            "th.output-cell",
            ".decision-table-name",
        ]) {
            for (const node of document.querySelectorAll(selector)) {
                guard(() => node.click());
                await sleep(40);
            }
        }
        guard(() => sheet?.getRoot?.());
        await expandPanels();
    };

    // ── Literal / boxed expression views ─────────────────────────────────────
    const drainExpression = async () => {
        // Rendered labels harvest on open; nudge the editable fields so the
        // variable-name / expression-language / textarea labels render too.
        for (const node of document.querySelectorAll(
            "textarea, .variable-name, .dms-input, .literal-expression-name, [contenteditable]",
        )) {
            guard(() => node.focus?.());
            guard(() => node.click?.());
            await sleep(30);
        }
        await expandPanels();
    };

    for (const view of views) {
        await guard(() => manager.open(view));
        await sleep(200);
        const viewer = manager.getActiveViewer();
        if (!viewer) continue;
        if (view.type === "drd") await drainDrd(viewer);
        else if (view.type === "decisionTable") await drainDecisionTable(viewer);
        else await drainExpression();
    }

    return window.__harvested.size;
};
