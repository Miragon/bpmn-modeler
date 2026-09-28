import type EventBus from "diagram-js/lib/core/EventBus";
import { afterEach, describe, expect, it, vi } from "vitest";

import { generateLargeC7Model, largeModelPresets } from "../../../scripts/perf/largeBpmnModel.mjs";
import { BrowserLinter } from "./bpmnlint/browserLinter";
import * as lintModule from "./bpmnlint/index";
import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";

// Pinned values are today's behaviour, not targets: a fix that removes redundant work
// updates its number in the same change, so improvements show up and regressions fail.

const TRANSACTION_BOUNDARY_OVERLAY = "transaction-boundaries";
const LINT_OVERLAY = "linting";
const EDIT_BURST_SIZE = 5;
const TEST_TIMEOUT_MS = 120_000;

const largeModel = generateLargeC7Model(largeModelPresets[2000]);
const BOUNDARIES = largeModel.transactionBoundaryCount;
const IN_PAGE_LINT_OVERLAYS = 361;

const PUSHED_ISSUE_ELEMENT_IDS = largeModel.editableElementIds.slice(0, 2 * EDIT_BURST_SIZE);
const PUSHED_RESULTS = {
    "label-required": PUSHED_ISSUE_ELEMENT_IDS.map((id) => ({
        id,
        message: "Element is missing label/name",
        category: "warn",
    })),
};

const lintRunSpy = vi.spyOn(BrowserLinter.prototype, "run");

type LintPath =
    | "in-page from construction"
    | "external → startInPageLinting handback"
    | "external with host-pushed results";

interface PhaseCounters {
    imports: number;
    lintRuns: number;
    boundaryOverlaysAdded: number;
    boundaryOverlays: number;
    lintOverlaysAdded: number;
    lintOverlaysRemoved: number;
}

let modeler: BpmnModeler | undefined;
const mountedNodes: HTMLElement[] = [];

afterEach(() => {
    modeler?.destroy();
    modeler = undefined;
    mountedNodes.forEach((node) => node.remove());
    mountedNodes.length = 0;
});

function mount(): { container: HTMLElement; panel: HTMLElement } {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    container.style.cssText = "position:absolute;width:1200px;height:800px";
    document.body.append(container, panel);
    mountedNodes.push(container, panel);
    return { container, panel };
}

function animationFrames(count: number): Promise<void> {
    return new Promise((resolve) => {
        const step = (remaining: number) =>
            remaining === 0 ? resolve() : requestAnimationFrame(() => step(remaining - 1));
        step(count);
    });
}

// `linting.completed` fires only for the newest run; superseded runs still finish after it.
async function settleAfter(eventBus: EventBus, action: () => unknown): Promise<void> {
    const lintCompleted = new Promise<void>((resolve) =>
        eventBus.once("linting.completed", () => resolve()),
    );
    await action();
    await lintCompleted;
    let awaitedRuns = -1;
    while (awaitedRuns !== lintRunSpy.mock.results.length) {
        awaitedRuns = lintRunSpy.mock.results.length;
        await Promise.allSettled(lintRunSpy.mock.results.map((result) => result.value));
    }
    await animationFrames(2);
}

async function openLargeModel(lintPath: LintPath) {
    const { container, panel } = mount();
    const handle = await createModeler(container, {
        engine: "c7",
        propertiesPanel: { parent: panel },
        linting:
            lintPath === "in-page from construction"
                ? { module: lintModule }
                : { module: lintModule, results: "external" },
    });
    const pushesResults = lintPath === "external with host-pushed results";
    modeler = handle;

    const eventBus = handle.getService("eventBus");
    const overlays = handle.getService("overlays");
    const modeling = handle.getService("modeling");
    const elementRegistry = handle.getService("elementRegistry");

    let imports = 0;
    // A diagram-js listener that returns a value stops propagation to later listeners.
    eventBus.on("import.done", () => {
        imports++;
    });

    let boundaryOverlaysAdded = 0;
    let lintOverlaysAdded = 0;
    let lintOverlaysRemoved = 0;
    const addOverlay = overlays.add.bind(overlays);
    overlays.add = ((element, type, overlay) => {
        if (type === TRANSACTION_BOUNDARY_OVERLAY) boundaryOverlaysAdded++;
        if (type === LINT_OVERLAY) lintOverlaysAdded++;
        return addOverlay(element, type, overlay);
    }) as typeof overlays.add;
    const removeOverlays = overlays.remove.bind(overlays);
    overlays.remove = ((filter) => {
        lintOverlaysRemoved += [overlays.get(filter)]
            .flat()
            .filter((overlay) => overlay?.type === LINT_OVERLAY).length;
        removeOverlays(filter);
    }) as typeof overlays.remove;

    const totals = () => ({
        imports,
        lintRuns: lintRunSpy.mock.calls.length,
        boundaryOverlaysAdded,
        lintOverlaysAdded,
        lintOverlaysRemoved,
    });

    async function measure(phase: () => Promise<void>): Promise<PhaseCounters> {
        const before = totals();
        await phase();
        const after = totals();
        return {
            imports: after.imports - before.imports,
            lintRuns: after.lintRuns - before.lintRuns,
            boundaryOverlaysAdded: after.boundaryOverlaysAdded - before.boundaryOverlaysAdded,
            boundaryOverlays: [overlays.get({ type: TRANSACTION_BOUNDARY_OVERLAY })].flat().length,
            lintOverlaysAdded: after.lintOverlaysAdded - before.lintOverlaysAdded,
            lintOverlaysRemoved: after.lintOverlaysRemoved - before.lintOverlaysRemoved,
        };
    }

    // Every host delivers settings after the first import (BpmnModelerSettingQuery).
    const open = async () => {
        if (lintPath === "in-page from construction") {
            await settleAfter(eventBus, () => handle.loadDiagram(largeModel.xml));
        } else if (pushesResults) {
            await handle.loadDiagram(largeModel.xml);
            await settleAfter(eventBus, () => handle.applyLintResults(PUSHED_RESULTS));
        } else {
            await handle.loadDiagram(largeModel.xml);
            await settleAfter(eventBus, () => handle.startInPageLinting());
        }
        handle.setSettings({ showTransactionBoundaries: true });
    };

    const reimport = () => settleAfter(eventBus, () => handle.loadDiagram(largeModel.xml));

    const unchangedRelint = () =>
        settleAfter(eventBus, () => eventBus.fire("linting.configChanged"));

    // One frame apart, like keystrokes or drag steps, so a debounce can coalesce them.
    const editBurst = async () => {
        type MovableShape = Parameters<typeof modeling.moveElements>[0][number];
        const shapes = largeModel.editableElementIds
            .slice(0, EDIT_BURST_SIZE)
            .map((id) => elementRegistry.get(id) as MovableShape);
        const lastShape = shapes.pop()!;
        for (const shape of shapes) {
            modeling.moveElements([shape], { x: 0, y: 10 });
            await animationFrames(1);
        }
        await settleAfter(eventBus, () => modeling.moveElements([lastShape], { x: 0, y: 10 }));
    };

    return {
        measureOpen: () => measure(open),
        measureReimport: () => measure(reimport),
        measureUnchangedRelint: () => measure(unchangedRelint),
        measureEditBurst: () => measure(editBurst),
    };
}

const pinnedCounters: {
    lintPath: LintPath;
    open: PhaseCounters;
    reimport: PhaseCounters;
    unchangedRelint: PhaseCounters;
    editBurst: PhaseCounters;
}[] = [
    {
        lintPath: "in-page from construction",
        open: {
            imports: 1,
            lintRuns: 1,
            boundaryOverlaysAdded: 2 * BOUNDARIES,
            boundaryOverlays: 2 * BOUNDARIES,
            lintOverlaysAdded: IN_PAGE_LINT_OVERLAYS,
            lintOverlaysRemoved: 0,
        },
        reimport: {
            imports: 1,
            lintRuns: 1,
            boundaryOverlaysAdded: BOUNDARIES,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: IN_PAGE_LINT_OVERLAYS,
            lintOverlaysRemoved: 0,
        },
        unchangedRelint: {
            imports: 0,
            lintRuns: 1,
            boundaryOverlaysAdded: 0,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: 0,
            lintOverlaysRemoved: 0,
        },
        editBurst: {
            imports: 0,
            lintRuns: 1,
            boundaryOverlaysAdded: EDIT_BURST_SIZE * BOUNDARIES,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: 0,
            lintOverlaysRemoved: 0,
        },
    },
    {
        lintPath: "external → startInPageLinting handback",
        open: {
            imports: 1,
            lintRuns: 1,
            boundaryOverlaysAdded: 2 * BOUNDARIES,
            boundaryOverlays: 2 * BOUNDARIES,
            lintOverlaysAdded: IN_PAGE_LINT_OVERLAYS,
            lintOverlaysRemoved: 0,
        },
        reimport: {
            imports: 1,
            lintRuns: 1,
            boundaryOverlaysAdded: BOUNDARIES,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: IN_PAGE_LINT_OVERLAYS,
            lintOverlaysRemoved: 0,
        },
        unchangedRelint: {
            imports: 0,
            lintRuns: 1,
            boundaryOverlaysAdded: 0,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: 0,
            lintOverlaysRemoved: 0,
        },
        editBurst: {
            imports: 0,
            lintRuns: 1,
            boundaryOverlaysAdded: EDIT_BURST_SIZE * BOUNDARIES,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: 0,
            lintOverlaysRemoved: 0,
        },
    },
    {
        lintPath: "external with host-pushed results",
        open: {
            imports: 1,
            lintRuns: 0,
            boundaryOverlaysAdded: 2 * BOUNDARIES,
            boundaryOverlays: 2 * BOUNDARIES,
            lintOverlaysAdded: PUSHED_ISSUE_ELEMENT_IDS.length,
            lintOverlaysRemoved: 0,
        },
        reimport: {
            imports: 1,
            lintRuns: 0,
            boundaryOverlaysAdded: BOUNDARIES,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: PUSHED_ISSUE_ELEMENT_IDS.length,
            lintOverlaysRemoved: 0,
        },
        unchangedRelint: {
            imports: 0,
            lintRuns: 0,
            boundaryOverlaysAdded: 0,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: 0,
            lintOverlaysRemoved: 0,
        },
        // Every edit relints; without a new push the cached results must not touch overlays.
        editBurst: {
            imports: 0,
            lintRuns: 0,
            boundaryOverlaysAdded: EDIT_BURST_SIZE * BOUNDARIES,
            boundaryOverlays: BOUNDARIES,
            lintOverlaysAdded: 0,
            lintOverlaysRemoved: 0,
        },
    },
];

describe.each(pinnedCounters)("2k-node C7 model, lint $lintPath", (pinned) => {
    it(
        "pins imports, lint runs and overlay work per phase",
        async () => {
            const model = await openLargeModel(pinned.lintPath);

            expect.soft(await model.measureOpen(), "open").toEqual(pinned.open);
            expect.soft(await model.measureReimport(), "reimport").toEqual(pinned.reimport);
            expect
                .soft(await model.measureUnchangedRelint(), "unchanged relint")
                .toEqual(pinned.unchangedRelint);
            expect.soft(await model.measureEditBurst(), "edit burst").toEqual(pinned.editBurst);
        },
        TEST_TIMEOUT_MS,
    );
});
