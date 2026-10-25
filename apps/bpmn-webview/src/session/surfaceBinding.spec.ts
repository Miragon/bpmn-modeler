import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LAYOUT_FORMATTED_EVENT } from "@miragon/bpmn-modeler-layout";
import {
    type Command,
    isMessageOfType,
    type MessageOfType,
    type ProtocolMessageType,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import type { SurfaceHandle } from "../surface";
import type { WebviewState } from "../webviewState";
import { createSurfaceBinder } from "./surfaceBinding";

const mocks = vi.hoisted(() => ({ stateManagerCreated: vi.fn() }));

vi.mock("../state", () => ({
    WebviewStateManager: class {
        constructor(...args: unknown[]) {
            mocks.stateManagerCreated(this, ...args);
        }
    },
}));

function createHost() {
    const posted: (Command | Query)[] = [];
    return {
        posted,
        getState: vi.fn((): WebviewState | undefined => undefined),
        setState: vi.fn(),
        updateState: vi.fn(),
        postMessage: vi.fn((message: Command | Query) => {
            posted.push(message);
        }),
    };
}

const postedOfType = <TType extends ProtocolMessageType>(
    posted: (Command | Query)[],
    type: TType,
) => posted.filter((message): message is MessageOfType<TType> => isMessageOfType(message, type));

function createEventBus() {
    const listeners = new Map<string, ((payload?: unknown) => void)[]>();
    return {
        on: vi.fn((event: string, listener: (payload?: unknown) => void) => {
            listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        }),
        fire: (event: string, payload?: unknown) =>
            (listeners.get(event) ?? []).forEach((listener) => listener(payload)),
    };
}

function fakeModeler() {
    const eventBus = createEventBus();
    const commandStackListeners: (() => void)[] = [];
    let definitions: object = {};
    const modeler = {
        setMode: vi.fn(),
        newDiagram: vi.fn(),
        applyLintResults: vi.fn(),
        formatDiagram: vi.fn(),
        getDefinitions: vi.fn(() => definitions),
        onCommandStackChanged: vi.fn((listener: () => void) => {
            commandStackListeners.push(listener);
        }),
        getService: vi.fn(() => eventBus),
    };
    return {
        modeler,
        eventBus,
        changeCommandStack: () => commandStackListeners.forEach((listener) => listener()),
        setDefinitions: (next: object) => {
            definitions = next;
        },
    };
}

function fakeDesigner() {
    const eventBus = createEventBus();
    const designer = {
        newDiagram: vi.fn(),
        applyLintResults: vi.fn(),
        formatDiagram: vi.fn(),
        getService: vi.fn(() => eventBus),
    };
    return { designer, eventBus };
}

const fakeViewer = () => ({ loadDiagram: vi.fn(), getService: vi.fn() });

const scriptTaskDefinitions = {
    rootElements: [
        {
            $type: "bpmn:Process",
            flowElements: [{ $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "total" }],
        },
    ],
};

const scripting = { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() };

function binderFor({
    engine = "c7",
    capabilities = { scripting },
}: {
    engine?: "c7" | "c8" | undefined;
    capabilities?: { scripting?: typeof scripting };
} = {}) {
    const host = createHost();
    const session = { scheduleSync: vi.fn(), isReloadingForEngine: false };
    const elementTemplatesReply = { done: vi.fn() };
    const panelRoot = document.createElement("div");
    const binder = createSurfaceBinder(host, {
        session,
        panelRoot,
        engine,
        capabilities,
        elementTemplatesReply,
    });
    return { host, session, elementTemplatesReply, panelRoot, binder };
}

const asSurface = (handle: object) => handle as unknown as SurfaceHandle;

describe("createSurfaceBinder", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe("bindSurface", () => {
        it("syncs every modeler command stack change to the host", () => {
            const { session, binder } = binderFor({ engine: "c8" });
            const { modeler, changeCommandStack } = fakeModeler();

            binder.bindSurface(asSurface(modeler));
            changeCommandStack();

            expect(session.scheduleSync).toHaveBeenCalledOnce();
        });

        it("syncs a designer command stack change, which only its event bus announces", () => {
            const { session, binder } = binderFor({ engine: undefined });
            const { designer, eventBus } = fakeDesigner();

            binder.bindSurface(asSurface(designer));
            eventBus.fire("commandStack.changed");

            expect(session.scheduleSync).toHaveBeenCalledOnce();
        });

        it("subscribes nothing on the readonly viewer", () => {
            const { host, session, binder } = binderFor();
            const viewer = fakeViewer();

            binder.bindSurface(asSurface(viewer));
            vi.runAllTimers();

            expect(viewer.getService).not.toHaveBeenCalled();
            expect(session.scheduleSync).not.toHaveBeenCalled();
            expect(host.postMessage).not.toHaveBeenCalled();
        });

        it("reports every format outcome the surface announces", () => {
            const { host, binder } = binderFor({ engine: undefined });
            const { designer, eventBus } = fakeDesigner();

            binder.bindSurface(asSurface(designer));
            eventBus.fire(LAYOUT_FORMATTED_EVENT, {
                status: "failed",
                diagnostics: ["overlap"],
                code: "LAYOUT_FAILED",
                message: "could not lay out",
            });

            expect(postedOfType(host.posted, "DiagramFormattedCommand")).toEqual([
                expect.objectContaining({
                    status: "failed",
                    diagnostics: ["overlap"],
                    code: "LAYOUT_FAILED",
                    message: "could not lay out",
                }),
            ]);
        });

        it("builds the state manager over the surface and the panel root", () => {
            const { host, panelRoot, binder } = binderFor();
            const viewer = fakeViewer();

            const binding = binder.bindSurface(asSurface(viewer));

            expect(mocks.stateManagerCreated).toHaveBeenCalledExactlyOnceWith(
                binding.stateManager,
                host,
                viewer,
                panelRoot,
            );
        });

        it("seeds the C7 process variables and publishes them again after a change", async () => {
            const { host, binder } = binderFor();
            const { modeler, changeCommandStack, setDefinitions } = fakeModeler();

            binder.bindSurface(asSurface(modeler));
            await vi.advanceTimersByTimeAsync(300);
            setDefinitions(scriptTaskDefinitions);
            changeCommandStack();
            await vi.advanceTimersByTimeAsync(300);

            expect(postedOfType(host.posted, "UpdateScriptVariablesCommand")).toEqual([
                expect.objectContaining({ variables: [] }),
                expect.objectContaining({
                    variables: [expect.objectContaining({ name: "total" })],
                }),
            ]);
        });

        it("drops the variable publish still pending when the binding is disposed", async () => {
            const { host, binder } = binderFor();
            const { modeler } = fakeModeler();

            binder.bindSurface(asSurface(modeler)).dispose();
            await vi.advanceTimersByTimeAsync(300);

            expect(modeler.getDefinitions).not.toHaveBeenCalled();
            expect(postedOfType(host.posted, "UpdateScriptVariablesCommand")).toEqual([]);
        });

        it("leaves the next surface's pending publish to the next binding", async () => {
            const { host, binder } = binderFor();
            const first = fakeModeler();
            const second = fakeModeler();

            const firstBinding = binder.bindSurface(asSurface(first.modeler));
            binder.bindSurface(asSurface(second.modeler));
            firstBinding.dispose();
            await vi.advanceTimersByTimeAsync(300);

            expect(first.modeler.getDefinitions).not.toHaveBeenCalled();
            expect(second.modeler.getDefinitions).toHaveBeenCalledOnce();
            expect(postedOfType(host.posted, "UpdateScriptVariablesCommand")).toHaveLength(1);
        });

        it("stops publishing process variables once an engine reload began", async () => {
            const { host, session, binder } = binderFor();
            const { modeler, changeCommandStack } = fakeModeler();

            binder.bindSurface(asSurface(modeler));
            session.isReloadingForEngine = true;
            changeCommandStack();
            await vi.advanceTimersByTimeAsync(300);

            expect(modeler.getDefinitions).not.toHaveBeenCalled();
            expect(postedOfType(host.posted, "UpdateScriptVariablesCommand")).toEqual([]);
        });

        it.each([
            ["a Camunda 8 modeler", { engine: "c8" as const }],
            ["a modeler without the scripting port", { capabilities: {} }],
        ])("publishes no process variables for %s", async (_label, options) => {
            const { host, binder } = binderFor(options);
            const { modeler, changeCommandStack } = fakeModeler();

            const binding = binder.bindSurface(asSurface(modeler));
            changeCommandStack();
            await vi.advanceTimersByTimeAsync(300);
            binding.dispose();

            expect(modeler.onCommandStackChanged).toHaveBeenCalledOnce();
            expect(modeler.getDefinitions).not.toHaveBeenCalled();
            expect(postedOfType(host.posted, "UpdateScriptVariablesCommand")).toEqual([]);
        });
    });

    describe("requestSurfaceResources", () => {
        it("asks for the element templates and the lint config of a modeler", () => {
            const { host, elementTemplatesReply, binder } = binderFor();

            binder.requestSurfaceResources(asSurface(fakeModeler().modeler));

            expect(host.posted.map((message) => message.type)).toEqual([
                "GetElementTemplatesCommand",
                "GetBpmnlintConfigCommand",
            ]);
            expect(elementTemplatesReply.done).not.toHaveBeenCalled();
        });

        it("settles the templates reply for a designer, which lints but takes no templates", () => {
            const { host, elementTemplatesReply, binder } = binderFor({ engine: undefined });

            binder.requestSurfaceResources(asSurface(fakeDesigner().designer));

            expect(host.posted.map((message) => message.type)).toEqual([
                "GetBpmnlintConfigCommand",
            ]);
            expect(elementTemplatesReply.done).toHaveBeenCalledExactlyOnceWith(undefined);
        });

        it("asks the host for nothing on the readonly viewer", () => {
            const { host, elementTemplatesReply, binder } = binderFor();

            binder.requestSurfaceResources(asSurface(fakeViewer()));

            expect(host.postMessage).not.toHaveBeenCalled();
            expect(elementTemplatesReply.done).toHaveBeenCalledExactlyOnceWith(undefined);
        });
    });
});
