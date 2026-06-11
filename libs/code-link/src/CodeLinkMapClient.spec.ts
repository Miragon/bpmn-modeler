import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("bpmn-js/lib/util/ModelUtil", () => ({
    is: (element: { type?: string } | undefined, type: string) => element?.type === type,
}));

import { implementationStatusKey, SyncActivitiesCommand } from "@miragon/bpmn-modeler-shared";

import { CodeLinkMapClient } from "./CodeLinkMapClient";

interface FakeElement {
    id?: string;
    type?: string;
    businessObject?: { get(name: string): unknown };
}

function serviceTask(id: string, javaClass: string): FakeElement {
    return {
        id,
        type: "bpmn:ServiceTask",
        businessObject: { get: (name) => (name === "camunda:class" ? javaClass : undefined) },
    };
}

function setup(elements: FakeElement[] = []) {
    const handlers: Record<string, ((event?: unknown) => void)[]> = {};
    const eventBus = {
        on: (event: string, callback: (event?: unknown) => void) => {
            (handlers[event] ??= []).push(callback);
        },
    };
    const fire = (event: string, payload?: unknown) =>
        (handlers[event] ?? []).forEach((callback) => callback(payload));

    const registryElements = [...elements];
    const elementRegistry = { getAll: () => registryElements as never };
    const contextPad = { isOpen: vi.fn().mockReturnValue(false), open: vi.fn() };
    const vsCodeBridge = { postMessage: vi.fn() };

    const client = new CodeLinkMapClient(
        eventBus as never,
        elementRegistry,
        contextPad as never,
        vsCodeBridge as never,
    );

    const lastSentEntries = () => {
        const calls = vsCodeBridge.postMessage.mock.calls;
        const command = calls[calls.length - 1][0] as SyncActivitiesCommand;
        return command.entries;
    };

    return { client, fire, contextPad, vsCodeBridge, registryElements, lastSentEntries };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("CodeLinkMapClient — syncing", () => {
    it("posts a SyncActivitiesCommand immediately on import.done", () => {
        const { fire, vsCodeBridge, lastSentEntries } = setup([
            serviceTask("Activity_1", "com.example.A"),
        ]);

        fire("import.done");

        expect(vsCodeBridge.postMessage).toHaveBeenCalledTimes(1);
        expect(vsCodeBridge.postMessage.mock.calls[0][0]).toBeInstanceOf(SyncActivitiesCommand);
        expect(lastSentEntries()).toEqual([
            { activityId: "Activity_1", kind: "javaClass", reference: "com.example.A" },
        ]);
    });

    it("debounces a burst of commandStack.changed into a single post", () => {
        vi.useFakeTimers();
        const { fire, vsCodeBridge } = setup([serviceTask("Activity_1", "com.example.A")]);

        fire("commandStack.changed");
        fire("commandStack.changed");
        fire("commandStack.changed");
        expect(vsCodeBridge.postMessage).not.toHaveBeenCalled();

        vi.advanceTimersByTime(400);
        expect(vsCodeBridge.postMessage).toHaveBeenCalledTimes(1);
    });

    it("skips the post when the implementation list is unchanged", () => {
        vi.useFakeTimers();
        const { fire, vsCodeBridge } = setup([serviceTask("Activity_1", "com.example.A")]);

        fire("import.done");
        expect(vsCodeBridge.postMessage).toHaveBeenCalledTimes(1);

        // An edit that did not touch any implementation binding.
        fire("commandStack.changed");
        vi.advanceTimersByTime(400);
        expect(vsCodeBridge.postMessage).toHaveBeenCalledTimes(1);
    });

    it("posts again once a binding actually changes", () => {
        vi.useFakeTimers();
        const element = serviceTask("Activity_1", "com.example.A");
        const { fire, vsCodeBridge, registryElements, lastSentEntries } = setup([element]);

        fire("import.done");
        registryElements[0] = serviceTask("Activity_1", "com.example.B");

        fire("commandStack.changed");
        vi.advanceTimersByTime(400);

        expect(vsCodeBridge.postMessage).toHaveBeenCalledTimes(2);
        expect(lastSentEntries()).toEqual([
            { activityId: "Activity_1", kind: "javaClass", reference: "com.example.B" },
        ]);
    });
});

describe("CodeLinkMapClient — status", () => {
    it("treats unknown references as resolved (optimistic) and a cached false as hidden", () => {
        const element = serviceTask("Activity_1", "com.example.A");
        const { client } = setup([element]);

        expect(client.isResolved(element)).toBe(true); // unknown

        client.applyStatus({ [implementationStatusKey("Activity_1", "com.example.A")]: false });
        expect(client.isResolved(element)).toBe(false);

        client.applyStatus({ [implementationStatusKey("Activity_1", "com.example.A")]: true });
        expect(client.isResolved(element)).toBe(true);
    });

    it("keys status by reference so a reference edit falls back to optimistic show", () => {
        const element = serviceTask("Activity_1", "com.example.A");
        const { client } = setup([element]);
        client.applyStatus({ [implementationStatusKey("Activity_1", "com.example.A")]: false });

        // The user changes the class; the old false no longer applies.
        element.businessObject = {
            get: (name) => (name === "camunda:class" ? "com.example.B" : undefined),
        };
        expect(client.isResolved(element)).toBe(true);
    });

    it("refreshes the open context pad when the shown element's status flips", () => {
        const element = serviceTask("Activity_1", "com.example.A");
        const { client, fire, contextPad } = setup([element]);
        contextPad.isOpen.mockReturnValue(true);
        fire("contextPad.open", { current: { target: element } });

        client.applyStatus({ [implementationStatusKey("Activity_1", "com.example.A")]: false });

        expect(contextPad.open).toHaveBeenCalledWith(element, true);
    });

    it("does not refresh the pad when the shown element's status is unchanged", () => {
        const element = serviceTask("Activity_1", "com.example.A");
        const { client, fire, contextPad } = setup([element]);
        contextPad.isOpen.mockReturnValue(true);
        fire("contextPad.open", { current: { target: element } });

        // unknown → true and the push also says true: no visible change.
        client.applyStatus({ [implementationStatusKey("Activity_1", "com.example.A")]: true });

        expect(contextPad.open).not.toHaveBeenCalled();
    });

    it("ignores a multi-selection pad target (the entry never shows for one)", () => {
        const element = serviceTask("Activity_1", "com.example.A");
        const { client, fire, contextPad } = setup([element]);
        contextPad.isOpen.mockReturnValue(true);
        fire("contextPad.open", { current: { target: [element, element] } });

        client.applyStatus({ [implementationStatusKey("Activity_1", "com.example.A")]: false });

        expect(contextPad.open).not.toHaveBeenCalled();
    });
});
