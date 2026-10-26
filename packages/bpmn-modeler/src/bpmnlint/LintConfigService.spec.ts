import type { BpmnlintConfig, LintResults, LintRunEvent } from "@miragon/bpmn-modeler-types";
import { BpmnModdle } from "bpmn-moddle";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LintConfigService, type LintTierInit } from "./LintConfigService";

// The tier rules are pinned in lintTierMachine.spec.ts; these rows cover what the
// adapter does with them: the vendor linting service, the canvas chrome and the
// real browser linter.

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

const LABEL_RULES: BpmnlintConfig = { rules: { "label-required": "error" } };
const END_EVENT_RULES: BpmnlintConfig = { rules: { "end-event-required": "error" } };
const PUSHED: LintResults = { "rule-y": [{ id: "B", message: "y", category: "error" }] };

let definitions: unknown;

beforeAll(async () => {
    ({ rootElement: definitions } = await BpmnModdle().fromXML(XML));
});

/** Minimal stand-in for the bpmn-js-bpmnlint `linting` DI service. */
function fakeLinting() {
    return {
        active: false,
        updates: 0,
        // Overwritten by the constructor; a real function keeps the fake assignable.
        lint: (() => Promise.resolve({})) as () => Promise<LintResults>,
        isActive(): boolean {
            return this.active;
        },
        toggle(next: boolean): void {
            this.active = next;
        },
        update(): void {
            this.updates++;
        },
    };
}

/** A fake diagram-js `Canvas` over a fresh `.djs-container` in the document. */
function fakeCanvas(): { getContainer(): HTMLElement } {
    const container = document.createElement("div");
    container.className = "djs-container";
    document.body.appendChild(container);
    return { getContainer: () => container };
}

/** A fake event bus that records handlers so a test can fire `import.done`. */
function fakeEventBus() {
    const handlers: Record<string, Array<(event: unknown) => void>> = {};
    return {
        on: (event: string, callback: (event: unknown) => void) => {
            (handlers[event] ??= []).push(callback);
        },
        fire: (event: string) => {
            (handlers[event] ?? []).forEach((handler) => handler(undefined));
        },
    };
}

/** Appends a vendor summary pill (wrapped, as bpmn-js-bpmnlint mounts it) to a container. */
function addPill(container: HTMLElement): void {
    const pill = document.createElement("button");
    pill.className = "bjsl-button";
    const wrap = document.createElement("div");
    wrap.appendChild(pill);
    container.appendChild(wrap);
}

function makeService(opts: {
    tier: LintTierInit["tier"];
    config?: LintTierInit["config"];
    imported?: boolean;
}) {
    const linting = fakeLinting();
    const canvas = fakeCanvas();
    addPill(canvas.getContainer());
    const bus = fakeEventBus();
    const lintRuns: LintRunEvent[] = [];
    const toggles: boolean[] = [];
    let imported = opts.imported ?? false;
    const service = new LintConfigService(
        linting,
        { tier: opts.tier, engine: "c7", mode: "implement", config: opts.config },
        {
            onLintResults: (event) => lintRuns.push(event),
            onLintingToggled: (enabled) => toggles.push(enabled),
        },
        (template) => template,
        canvas,
        { getDefinitions: () => (imported ? definitions : undefined) },
        bus,
    );
    const container = canvas.getContainer();
    const importDiagram = (): void => {
        imported = true;
        bus.fire("import.done");
    };
    return { service, linting, container, importDiagram, lintRuns, toggles };
}

function button(container: HTMLElement, selector: string): HTMLButtonElement {
    const found = container.querySelector<HTMLButtonElement>(selector);
    if (!found) {
        throw new Error(`no ${selector} in the container`);
    }
    return found;
}

const ruleNames = (results: LintResults): string[] => Object.keys(results).sort();

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("LintConfigService: in-page tier", () => {
    it("activates on import and marks its container", () => {
        const { linting, container, importDiagram } = makeService({ tier: "in-page" });
        expect(linting.isActive()).toBe(false);

        importDiagram();

        expect(linting.isActive()).toBe(true);
        expect(container.classList.contains("bpmnlint-active")).toBe(true);
        expect(button(container, ".lint-off-button").hidden).toBe(false);
    });

    it("activates at once when a diagram is already imported", () => {
        const { linting } = makeService({ tier: "in-page", imported: true });

        expect(linting.isActive()).toBe(true);
    });

    it("lints with the browser linter, reports the run and returns its results", async () => {
        const { linting, lintRuns } = makeService({
            tier: "in-page",
            config: LABEL_RULES,
            imported: true,
        });

        const results = await linting.lint();

        expect(ruleNames(results)).toEqual(["label-required"]);
        expect(lintRuns.map((run) => run.results)).toEqual([results]);
    });

    it("re-lints with the new mode's rules after setMode", async () => {
        const { service, linting } = makeService({
            tier: "in-page",
            config: { design: END_EVENT_RULES, implement: LABEL_RULES },
            imported: true,
        });
        const updatesBefore = linting.updates;

        service.setMode("design");

        expect(linting.updates).toBe(updatesBefore + 1);
        expect(ruleNames(await linting.lint())).toEqual(["end-event-required"]);
    });
});

describe("LintConfigService: host pushes", () => {
    it("replays host-pushed results in the external tier and never echoes them", async () => {
        const { service, linting, lintRuns } = makeService({ tier: "external", imported: true });
        await expect(linting.lint()).resolves.toEqual({});

        service.applyLintResults(PUSHED);

        await expect(linting.lint()).resolves.toEqual(PUSHED);
        expect(lintRuns).toEqual([]);
    });

    it("stops linting in-page once the host pushes results", async () => {
        const { service, linting, lintRuns } = makeService({ tier: "in-page", imported: true });

        service.applyLintResults(PUSHED);

        await expect(linting.lint()).resolves.toEqual(PUSHED);
        expect(lintRuns).toEqual([]);
    });

    it("lints the handed-back workspace config in-page", async () => {
        const { service, linting, container, lintRuns } = makeService({
            tier: "external",
            imported: true,
        });

        service.startInPageLinting(END_EVENT_RULES, "cfg-v1");

        expect(linting.isActive()).toBe(true);
        expect(container.classList.contains("bpmnlint-active")).toBe(true);
        expect(button(container, ".lint-off-button").hidden).toBe(false);
        const results = await linting.lint();
        expect(ruleNames(results)).toEqual(["end-event-required"]);
        expect(lintRuns.map((run) => run.results)).toEqual([results]);
    });

    it("activates linting and marks the container when results arrive", () => {
        const { service, linting, container } = makeService({ tier: "external" });

        service.applyLintResults({});

        expect(linting.isActive()).toBe(true);
        expect(container.classList.contains("bpmnlint-active")).toBe(true);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(false);
    });

    it("deactivates linting and clears the container class when results are null", () => {
        const { service, linting, container } = makeService({ tier: "external" });
        service.applyLintResults({});

        service.applyLintResults(null);

        expect(linting.isActive()).toBe(false);
        expect(container.classList.contains("bpmnlint-active")).toBe(false);
        expect(button(container, ".lint-off-button").hidden).toBe(true);
    });

    it("shows the disabled chip for a host disabled push", () => {
        const { service, linting, container } = makeService({ tier: "in-page", imported: true });

        service.applyLintingDisabled();

        expect(linting.isActive()).toBe(false);
        expect(container.classList.contains("bpmnlint-disabled")).toBe(true);
        expect(container.querySelector<HTMLElement>(".lint-disabled-chip")?.hidden).toBe(false);
    });

    it("never reports a toggle for a host push", () => {
        const { service, toggles } = makeService({ tier: "external" });

        service.applyLintResults({});
        service.applyLintResults(null);
        service.applyLintingDisabled();

        expect(toggles).toEqual([]);
    });
});

describe("LintConfigService: canvas toggle", () => {
    it("turns in-page linting off at once and reports the toggle", async () => {
        const { linting, container, toggles } = makeService({ tier: "in-page", imported: true });

        button(container, ".lint-off-button").click();

        expect(toggles).toEqual([false]);
        expect(linting.isActive()).toBe(false);
        expect(container.classList.contains("bpmnlint-active")).toBe(false);
        expect(button(container, ".lint-off-button").hidden).toBe(true);
        expect(container.querySelector<HTMLElement>(".lint-disabled-chip")?.hidden).toBe(false);
        await expect(linting.lint()).resolves.toEqual({});
    });

    it("re-enables in-page linting from the disabled chip", async () => {
        const { linting, container, toggles } = makeService({
            tier: "in-page",
            config: LABEL_RULES,
            imported: true,
        });
        button(container, ".lint-off-button").click();

        button(container, ".lint-enable-button").click();

        expect(toggles).toEqual([false, true]);
        expect(linting.isActive()).toBe(true);
        expect(container.classList.contains("bpmnlint-disabled")).toBe(false);
        expect(container.querySelector<HTMLElement>(".lint-disabled-chip")?.hidden).toBe(true);
        expect(ruleNames(await linting.lint())).toEqual(["label-required"]);
    });

    it("only reports the external off switch; the overlays wait for the host", () => {
        const { service, linting, container, toggles } = makeService({ tier: "external" });
        service.applyLintResults(PUSHED);

        button(container, ".lint-off-button").click();

        expect(toggles).toEqual([false]);
        expect(linting.isActive()).toBe(true);
        expect(container.querySelector(".lint-disabled-chip")).toBeNull();
    });
});

describe("LintConfigService: per-container scoping", () => {
    it("wraps only its own container's pill and marks only its own container", () => {
        const canvasA = fakeCanvas();
        const canvasB = fakeCanvas();
        addPill(canvasA.getContainer());
        addPill(canvasB.getContainer());

        new LintConfigService(
            fakeLinting(),
            { tier: "external", engine: "c7", mode: "implement" },
            {},
            (template) => template,
            canvasA,
            { getDefinitions: () => undefined },
            fakeEventBus(),
        ).applyLintResults({});

        expect(canvasA.getContainer().querySelector(".lint-toolbar")).not.toBeNull();
        expect(canvasB.getContainer().querySelector(".lint-toolbar")).toBeNull();
        expect(canvasA.getContainer().classList.contains("bpmnlint-active")).toBe(true);
        expect(canvasB.getContainer().classList.contains("bpmnlint-active")).toBe(false);
    });
});
