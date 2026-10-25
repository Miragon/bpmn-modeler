import { afterEach, describe, expect, it, vi } from "vitest";

import {
    type Command,
    FormReferenceStatusQuery,
    type Query,
    WorkspaceDefinitionsQuery,
} from "@miragon/bpmn-modeler-shared";
import type { WorkspaceDefinition } from "@miragon/bpmn-modeler";

import type { SurfaceHandle } from "../surface";
import {
    createProtocolCapabilities,
    DEFINITION_SEARCH_TIMEOUT_MS,
    FormReferenceAvailability,
} from "./protocolCapabilities";

const orderDefinition: WorkspaceDefinition = {
    kind: "message",
    name: "OrderPlaced",
    source: { path: "order.bpmn", label: "order.bpmn" },
    usages: [],
};

function createHost() {
    const sent: (Command | Query)[] = [];
    return {
        sent,
        postMessage: vi.fn((message: Command | Query) => {
            sent.push(message);
        }),
        sentOfType: (type: string) =>
            sent.filter((message) => message.type === type) as (Command &
                Record<string, unknown>)[],
    };
}

function modelerSurface(definitions: unknown): SurfaceHandle {
    return {
        setMode: vi.fn(),
        getDefinitions: vi.fn(() => definitions),
    } as unknown as SurfaceHandle;
}

const scriptTaskDefinitions = {
    rootElements: [
        {
            $type: "bpmn:Process",
            flowElements: [{ $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "total" }],
        },
    ],
};

const scriptOpenEvent = {
    elementId: "Task_1",
    kind: "script-task" as const,
    listenerIndex: undefined,
    eventName: undefined,
    scriptFormat: "javascript",
    content: "total = 1",
};

describe("FormReferenceAvailability", () => {
    it("knows no form until the host reports one", () => {
        const availability = new FormReferenceAvailability();

        expect(availability.has("Form_1")).toBe(false);

        availability.update(["Form_1"]);

        expect(availability.has("Form_1")).toBe(true);
        expect(availability.has("Form_2")).toBe(false);
    });

    it("reports and notifies only a change in the set of form ids", () => {
        const availability = new FormReferenceAvailability();
        const changed = vi.fn();
        availability.onChanged(changed);

        expect(availability.update(["Form_1", "Form_2"])).toBe(true);
        expect(availability.update(["Form_2", "Form_1"])).toBe(false);
        expect(changed).toHaveBeenCalledOnce();

        expect(availability.update(["Form_1", "Form_3"])).toBe(true);
        expect(changed).toHaveBeenCalledTimes(2);

        expect(availability.update(["Form_1"])).toBe(true);
        expect(changed).toHaveBeenCalledTimes(3);

        expect(availability.update([])).toBe(true);
        expect(availability.update([])).toBe(false);
        expect(changed).toHaveBeenCalledTimes(4);
    });

    it("stops notifying a listener that unsubscribed", () => {
        const availability = new FormReferenceAvailability();
        const kept = vi.fn();
        const dropped = vi.fn();
        availability.onChanged(kept);
        const unsubscribe = availability.onChanged(dropped);

        unsubscribe();
        availability.update(["Form_1"]);

        expect(kept).toHaveBeenCalledOnce();
        expect(dropped).not.toHaveBeenCalled();
    });
});

describe("createProtocolCapabilities", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("posts a host command for every navigation, code-link and script-source call", () => {
        const host = createHost();
        const { capabilities } = createProtocolCapabilities(host, () => modelerSurface({}));

        capabilities.modelNavigation.openReference({ id: "Form_1", kind: "form" });
        capabilities.codeLink.navigateToImplementation("com.example.Delegate", "javaClass");
        capabilities.codeLink.syncActivities([]);
        capabilities.scripting.scriptSourceChanged({
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            content: "total = 2",
        });

        expect(host.sent.map((message) => message.type)).toEqual([
            "NavigateToReferencedModelCommand",
            "NavigateToImplementationCommand",
            "SyncActivitiesCommand",
            "UpdateScriptSourceCommand",
        ]);
        expect(host.sentOfType("UpdateScriptSourceCommand")).toEqual([
            expect.objectContaining({ elementId: "Task_1", content: "total = 2" }),
        ]);
    });

    it("opens a script editor with the process variables of the live modeler", () => {
        const host = createHost();
        let surface = modelerSurface({ rootElements: [] });
        const { capabilities } = createProtocolCapabilities(host, () => surface);
        surface = modelerSurface(scriptTaskDefinitions);

        capabilities.scripting.openScriptEditor(scriptOpenEvent);

        const [command] = host.sentOfType("OpenScriptEditorCommand");
        expect(command).toMatchObject({ elementId: "Task_1", content: "total = 1" });
        expect(command.variables).toEqual([expect.objectContaining({ name: "total" })]);
    });

    it("opens a script editor without variables from a surface other than the modeler", () => {
        const host = createHost();
        const designer = { newDiagram: vi.fn() } as unknown as SurfaceHandle;
        const { capabilities } = createProtocolCapabilities(host, () => designer);

        capabilities.scripting.openScriptEditor(scriptOpenEvent);

        expect(host.sentOfType("OpenScriptEditorCommand")).toEqual([
            expect.objectContaining({ variables: [] }),
        ]);
    });

    it("offers a form reference only once the host reports the form", () => {
        const host = createHost();
        const { capabilities, handlers } = createProtocolCapabilities(host, () =>
            modelerSurface({}),
        );
        const { modelNavigation } = capabilities;
        const availabilityChanged = vi.fn();
        modelNavigation.onReferenceAvailabilityChanged!(availabilityChanged);

        expect(modelNavigation.isReferenceAvailable!({ id: "Process_1", kind: "process" })).toBe(
            true,
        );
        expect(modelNavigation.isReferenceAvailable!({ id: "Form_1", kind: "form" })).toBe(false);

        handlers.FormReferenceStatusQuery(new FormReferenceStatusQuery(["Form_1"]));

        expect(modelNavigation.isReferenceAvailable!({ id: "Form_1", kind: "form" })).toBe(true);
        expect(availabilityChanged).toHaveBeenCalledOnce();
    });

    it("asks the host for form reference status only for Camunda 8", () => {
        const host = createHost();
        const protocol = createProtocolCapabilities(host, () => modelerSurface({}));

        protocol.requestFormReferenceStatus("c7");
        protocol.requestFormReferenceStatus(undefined);
        expect(host.sentOfType("GetFormReferenceStatusCommand")).toHaveLength(0);

        protocol.requestFormReferenceStatus("c8");
        expect(host.sentOfType("GetFormReferenceStatusCommand")).toHaveLength(1);
    });

    it("pairs each search reply with its request id and rejects a failed search", async () => {
        const host = createHost();
        const { capabilities, handlers } = createProtocolCapabilities(host, () =>
            modelerSurface({}),
        );

        const first = capabilities.definitionSearch.search({ kind: "message", text: "pay" });
        const second = capabilities.definitionSearch.search({ kind: "message", text: "order" });
        const [firstRequest, secondRequest] = host.sentOfType("SearchWorkspaceDefinitionsCommand");
        handlers.WorkspaceDefinitionsQuery(new WorkspaceDefinitionsQuery(99, []));
        handlers.WorkspaceDefinitionsQuery(
            new WorkspaceDefinitionsQuery(secondRequest.requestId as number, [orderDefinition]),
        );
        handlers.WorkspaceDefinitionsQuery(
            new WorkspaceDefinitionsQuery(firstRequest.requestId as number, [], true),
        );

        expect(firstRequest).toMatchObject({ kind: "message", text: "pay" });
        expect(secondRequest.requestId).not.toBe(firstRequest.requestId);
        await expect(second).resolves.toEqual([orderDefinition]);
        await expect(first).rejects.toThrow("The host could not search other models");
    });

    it("fails a search the host never answers with a warning and ignores its late reply", async () => {
        vi.useFakeTimers();
        const host = createHost();
        const { capabilities, handlers } = createProtocolCapabilities(host, () =>
            modelerSurface({}),
        );
        const settled = vi.fn();
        void capabilities.definitionSearch.search({ kind: "message", text: "order" }).then(
            (definitions) => settled({ definitions }),
            (error: Error) => settled({ error: error.message }),
        );
        const [{ requestId }] = host.sentOfType("SearchWorkspaceDefinitionsCommand");

        await vi.advanceTimersByTimeAsync(DEFINITION_SEARCH_TIMEOUT_MS - 1);
        expect(settled).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(settled).toHaveBeenCalledExactlyOnceWith({
            error: "The host did not answer the search",
        });
        expect(host.sentOfType("LogWarningCommand")).toEqual([
            expect.objectContaining({ message: "No workspace search reply from the host" }),
        ]);

        handlers.WorkspaceDefinitionsQuery(
            new WorkspaceDefinitionsQuery(requestId as number, [orderDefinition]),
        );
        await Promise.resolve();
        expect(settled).toHaveBeenCalledOnce();
    });
});
