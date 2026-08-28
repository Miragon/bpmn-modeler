import { beforeEach, describe, expect, it, vi } from "vitest";

// The tier state machine is the unit under test; the actual browser lint run is
// mocked so these tests never spin up bpmnlint. `runMock` is hoisted so the
// `vi.mock` factory (itself hoisted) can close over it.
const { runMock, ctorMock } = vi.hoisted(() => ({ runMock: vi.fn(), ctorMock: vi.fn() }));
vi.mock("./browserLinter", () => ({
    // A class (not an arrow) so `new BrowserLinter()` constructs. `ctorMock`
    // records the (engine, config) args so a test can assert the handed-back
    // config reaches the linter (#1384).
    BrowserLinter: class {
        constructor(...args: unknown[]) {
            ctorMock(...args);
        }
        run = runMock;
    },
}));

import type { LintResults } from "@miragon/bpmn-modeler-types";

import { LintConfigService, type LintCallbacks, type LintTierInit } from "./LintConfigService";

/** A canned in-page lint outcome; distinct object identity lets us assert copies. */
const LINT_EVENT = {
    results: { "label-required": [{ id: "Task_1", message: "x", category: "warn" }] },
    unresolved: ["some-plugin/some-rule"],
};

/** Minimal stand-in for the bpmn-js-bpmnlint `linting` DI service. */
function fakeLinting() {
    return {
        active: false,
        // Overwritten by the constructor; a real function keeps the fake assignable.
        lint: (() => Promise.resolve({})) as () => Promise<LintResults>,
        isActive(): boolean {
            return this.active;
        },
        toggle: vi.fn(function (this: { active: boolean }, next?: boolean) {
            this.active = next ?? !this.active;
        }),
        update: vi.fn(),
    };
}

/**
 * A fake diagram-js `Canvas` over a fresh `.djs-container` in the document, so
 * the service's state classes and pill lookups are asserted per-container.
 */
function fakeCanvas(): { getContainer(): HTMLElement } {
    const container = document.createElement("div");
    container.className = "djs-container";
    document.body.appendChild(container);
    return { getContainer: () => container };
}

/** A fake event bus that records handlers so a test can fire `import.done`. */
function fakeEventBus() {
    const handlers: Record<string, Array<(e: unknown) => void>> = {};
    return {
        on: (event: string, cb: (e: unknown) => void) => {
            (handlers[event] ??= []).push(cb);
        },
        fire: (event: string, e?: unknown) => {
            (handlers[event] ?? []).forEach((h) => h(e));
        },
    };
}

/** Appends a vendor summary pill (wrapped, as bpmn-js-bpmnlint mounts it) to a container. */
function addPill(container: HTMLElement): HTMLButtonElement {
    const pill = document.createElement("button");
    pill.className = "bjsl-button";
    const wrap = document.createElement("div");
    wrap.appendChild(pill);
    container.appendChild(wrap);
    return pill;
}

type Bus = ReturnType<typeof fakeEventBus>;

/** Builds a service under test with sensible fakes; overrides via `opts`. */
function makeService(opts: {
    tier: LintTierInit["tier"];
    callbacks?: LintCallbacks;
    imported?: boolean;
    withPill?: boolean;
}) {
    const linting = fakeLinting();
    const canvas = fakeCanvas();
    if (opts.withPill !== false) {
        addPill(canvas.getContainer());
    }
    const bus = fakeEventBus();
    const callbacks: LintCallbacks = opts.callbacks ?? {
        onLintResults: vi.fn(),
        onLintingToggled: vi.fn(),
    };
    const bpmnjs = { getDefinitions: () => (opts.imported ? {} : null) };
    const service = new LintConfigService(
        linting,
        { tier: opts.tier, engine: "c7" },
        callbacks,
        (s) => s,
        canvas,
        bpmnjs,
        bus,
    );
    return { service, linting, canvas, bus: bus as Bus, callbacks };
}

function clickOffButton(container: HTMLElement): void {
    container
        .querySelector<HTMLButtonElement>(".lint-off-button")
        ?.dispatchEvent(new Event("click"));
}

function clickEnableButton(container: HTMLElement): void {
    container
        .querySelector<HTMLButtonElement>(".lint-enable-button")
        ?.dispatchEvent(new Event("click"));
}

beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
    runMock.mockResolvedValue(LINT_EVENT);
});

describe("LintConfigService: tier initialisation", () => {
    it("external tier stays inactive and replays host-pushed results", async () => {
        const onLintResults = vi.fn();
        const { linting } = makeService({ tier: "external", callbacks: { onLintResults } });

        expect(linting.isActive()).toBe(false);
        expect(linting.lint).toBeDefined();
        // Nothing pushed yet → empty results, and an external lint never echoes.
        await expect(linting.lint()).resolves.toEqual({});
        expect(onLintResults).not.toHaveBeenCalled();
    });

    it("in-page tier activates on import.done and marks its container", () => {
        const { linting, canvas, bus } = makeService({ tier: "in-page" });

        expect(linting.isActive()).toBe(false);
        bus.fire("import.done");

        expect(linting.isActive()).toBe(true);
        expect(canvas.getContainer().classList.contains("bpmnlint-active")).toBe(true);
        expect(canvas.getContainer().querySelector(".lint-off-button")).not.toBeNull();
    });

    it("in-page tier activates immediately when a diagram is already imported", () => {
        const { linting } = makeService({ tier: "in-page", imported: true });
        expect(linting.isActive()).toBe(true);
    });

    it("in-page lint runs the browser linter, emits the raw event, and returns a copy", async () => {
        const onLintResults = vi.fn();
        const { linting, bus } = makeService({ tier: "in-page", callbacks: { onLintResults } });
        bus.fire("import.done");

        const returned = await linting.lint();

        expect(runMock).toHaveBeenCalled();
        expect(onLintResults).toHaveBeenCalledWith(LINT_EVENT);
        // The vendor mutates the returned reports in place, so it must be a copy —
        // never the object handed to onLintResults.
        expect(returned).toEqual(LINT_EVENT.results);
        expect(returned).not.toBe(LINT_EVENT.results);
        expect((returned as typeof LINT_EVENT.results)["label-required"][0]).not.toBe(
            LINT_EVENT.results["label-required"][0],
        );
    });
});

describe("LintConfigService: precedence (any push wins)", () => {
    it("an external push switches an in-page instance to external and suspends in-page lint", async () => {
        const onLintResults = vi.fn();
        const { service, bus, linting } = makeService({
            tier: "in-page",
            callbacks: { onLintResults },
        });
        bus.fire("import.done");
        onLintResults.mockClear();

        const pushed = { "rule-y": [{ id: "B", message: "y", category: "error" }] };
        service.applyLintResults(pushed);

        // Now external: lint replays the pushed results and never echoes.
        await expect(linting.lint()).resolves.toEqual(pushed);
        expect(onLintResults).not.toHaveBeenCalled();
        expect(runMock).not.toHaveBeenCalled();
    });
});

describe("LintConfigService: startInPageLinting (host handback)", () => {
    it("switches an external instance to in-page, activating and emitting on the next run", async () => {
        const onLintResults = vi.fn();
        const { service, linting, canvas } = makeService({
            tier: "external",
            imported: true,
            callbacks: { onLintResults },
        });
        expect(linting.isActive()).toBe(false);

        service.startInPageLinting();

        // A diagram is already imported, so it activates immediately.
        expect(linting.isActive()).toBe(true);
        expect(canvas.getContainer().classList.contains("bpmnlint-active")).toBe(true);
        expect(canvas.getContainer().querySelector(".lint-off-button")).not.toBeNull();

        // Now on the in-page path: a relint runs the browser linter and echoes.
        const returned = await linting.lint();
        expect(runMock).toHaveBeenCalled();
        expect(onLintResults).toHaveBeenCalledWith(LINT_EVENT);
        expect(returned).toEqual(LINT_EVENT.results);
    });

    it("builds the browser linter with the handed-back workspace config (#1384)", () => {
        ctorMock.mockClear();
        const { service } = makeService({ tier: "external", imported: true });
        const config = { extends: "bpmnlint:recommended" };

        service.startInPageLinting(config);

        // The covered workspace config the host pushed is linted, not the default.
        expect(ctorMock).toHaveBeenLastCalledWith("c7", config);
    });

    it("defers activation to import.done when no diagram is imported yet", () => {
        const { service, linting, bus } = makeService({ tier: "external", imported: false });

        service.startInPageLinting();
        expect(linting.isActive()).toBe(false);

        bus.fire("import.done");
        expect(linting.isActive()).toBe(true);
    });

    it("no-ops when the user has disabled linting from the canvas", async () => {
        const { service, canvas, bus, linting } = makeService({ tier: "in-page" });
        bus.fire("import.done");
        clickOffButton(canvas.getContainer());
        expect(linting.isActive()).toBe(false);
        linting.toggle.mockClear();

        // A host instruction must never silently re-enable a user-disabled linter.
        service.startInPageLinting();

        expect(linting.isActive()).toBe(false);
        expect(linting.toggle).not.toHaveBeenCalled();
        expect(canvas.getContainer().querySelector(".lint-disabled-chip")).not.toBeNull();
        await expect(linting.lint()).resolves.toEqual({});
    });

    it("still lets a later external push win over the in-page handback", async () => {
        const onLintResults = vi.fn();
        const { service, linting } = makeService({
            tier: "external",
            imported: true,
            callbacks: { onLintResults },
        });
        service.startInPageLinting();
        onLintResults.mockClear();

        const pushed = { "rule-y": [{ id: "B", message: "y", category: "error" }] };
        service.applyLintResults(pushed);

        await expect(linting.lint()).resolves.toEqual(pushed);
        expect(onLintResults).not.toHaveBeenCalled();
    });
});

describe("LintConfigService: toggle matrix", () => {
    it("in-page off-button disables optimistically and reports the toggle", async () => {
        const onLintingToggled = vi.fn();
        const { service, canvas, bus, linting } = makeService({
            tier: "in-page",
            callbacks: { onLintingToggled },
        });
        void service;
        bus.fire("import.done");
        linting.toggle.mockClear();

        clickOffButton(canvas.getContainer());

        expect(onLintingToggled).toHaveBeenCalledWith(false);
        expect(linting.toggle).toHaveBeenCalledWith(false);
        expect(canvas.getContainer().querySelector(".lint-disabled-chip")).not.toBeNull();
        // Suspended: a relint now yields nothing.
        await expect(linting.lint()).resolves.toEqual({});
    });

    it("re-enable from the disabled chip reactivates in-page linting", async () => {
        const onLintingToggled = vi.fn();
        const { canvas, bus, linting } = makeService({
            tier: "in-page",
            callbacks: { onLintingToggled },
        });
        bus.fire("import.done");
        clickOffButton(canvas.getContainer());
        onLintingToggled.mockClear();

        clickEnableButton(canvas.getContainer());

        expect(onLintingToggled).toHaveBeenCalledWith(true);
        expect(linting.isActive()).toBe(true);
        await expect(linting.lint()).resolves.toEqual(LINT_EVENT.results);
    });

    it("external off-button reports the toggle only; overlays await the host push", () => {
        const onLintingToggled = vi.fn();
        const { service, canvas, linting } = makeService({
            tier: "external",
            callbacks: { onLintingToggled },
        });
        // Host pushed results first, so the off button exists.
        service.applyLintResults({ "rule-z": [{ id: "C", message: "z", category: "warn" }] });
        linting.toggle.mockClear();

        clickOffButton(canvas.getContainer());

        expect(onLintingToggled).toHaveBeenCalledWith(false);
        // No optimistic local change in the external tier.
        expect(linting.toggle).not.toHaveBeenCalled();
        expect(canvas.getContainer().querySelector(".lint-disabled-chip")).toBeNull();
    });

    it("programmatic renders never fire the toggle callback", () => {
        const onLintingToggled = vi.fn();
        const { service } = makeService({ tier: "external", callbacks: { onLintingToggled } });

        service.applyLintResults({});
        service.applyLintResults(null);
        service.applyLintingDisabled();

        expect(onLintingToggled).not.toHaveBeenCalled();
    });
});

describe("LintConfigService: external rendering (unchanged host flow)", () => {
    it("activates linting and marks the container active when results arrive", () => {
        const { service, canvas, linting } = makeService({ tier: "external" });

        service.applyLintResults({});

        expect(linting.isActive()).toBe(true);
        expect(canvas.getContainer().classList.contains("bpmnlint-active")).toBe(true);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(false);
    });

    it("deactivates linting and clears the container class when results are null", () => {
        const { service, canvas, linting } = makeService({ tier: "external" });
        service.applyLintResults({});
        linting.toggle.mockClear();

        service.applyLintResults(null);

        expect(linting.toggle).toHaveBeenCalledWith(false);
        expect(canvas.getContainer().classList.contains("bpmnlint-active")).toBe(false);
    });
});

describe("LintConfigService: per-container scoping", () => {
    it("wraps only its own container's pill and marks only its own container", () => {
        const linting = fakeLinting();
        const canvasA = fakeCanvas();
        const canvasB = fakeCanvas();
        addPill(canvasA.getContainer());
        addPill(canvasB.getContainer());

        new LintConfigService(
            linting,
            { tier: "external", engine: "c7" },
            {},
            (s) => s,
            canvasA,
            { getDefinitions: () => null },
            fakeEventBus(),
        ).applyLintResults({});

        expect(canvasA.getContainer().querySelector(".lint-toolbar")).not.toBeNull();
        expect(canvasB.getContainer().querySelector(".lint-toolbar")).toBeNull();
        expect(canvasA.getContainer().classList.contains("bpmnlint-active")).toBe(true);
        expect(canvasB.getContainer().classList.contains("bpmnlint-active")).toBe(false);
    });
});
