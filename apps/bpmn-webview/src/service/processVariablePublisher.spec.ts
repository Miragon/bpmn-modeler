import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    type Command,
    isMessageOfType,
    type Query,
    type UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";

import { createProcessVariablePublisher } from "./processVariablePublisher";

const noVariables = {};
const totalVariable = {
    rootElements: [
        {
            $type: "bpmn:Process",
            flowElements: [{ $type: "bpmn:ScriptTask", id: "Task_1", resultVariable: "total" }],
        },
    ],
};

function publisherOn(initialDefinitions: object = noVariables) {
    const posted: (Command | Query)[] = [];
    let definitions = initialDefinitions;
    const modeler = { getDefinitions: vi.fn(() => definitions as never) };
    const session = { isReloadingForEngine: false };
    const publisher = createProcessVariablePublisher(
        { postMessage: (message) => posted.push(message) },
        modeler,
        session,
    );
    return {
        posted,
        modeler,
        publisher,
        setDefinitions: (next: object) => {
            definitions = next;
        },
        beginEngineReload: () => {
            session.isReloadingForEngine = true;
        },
    };
}

const publishedVariableNames = (posted: (Command | Query)[]) =>
    posted
        .filter((message): message is UpdateScriptVariablesCommand =>
            isMessageOfType(message, "UpdateScriptVariablesCommand"),
        )
        .map((message) => message.variables.map((variable) => variable.name));

describe("createProcessVariablePublisher", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("publishes the variables once a burst of changes settles", async () => {
        const { posted, publisher, setDefinitions } = publisherOn();

        publisher.schedule();
        setDefinitions(totalVariable);
        publisher.schedule();
        await vi.advanceTimersByTimeAsync(299);
        expect(posted).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);

        expect(posted).toHaveLength(1);
        expect(publishedVariableNames(posted)).toEqual([["total"]]);
    });

    it("skips a variable set identical to the last one it published", async () => {
        const { posted, publisher, setDefinitions } = publisherOn();

        publisher.schedule();
        await vi.advanceTimersByTimeAsync(300);
        publisher.schedule();
        await vi.advanceTimersByTimeAsync(300);
        setDefinitions(totalVariable);
        publisher.schedule();
        await vi.advanceTimersByTimeAsync(300);

        expect(publishedVariableNames(posted)).toEqual([[], ["total"]]);
    });

    it("drops the publish a cancel catches before it fires", async () => {
        const { posted, modeler, publisher } = publisherOn();

        publisher.schedule();
        publisher.cancel();
        await vi.advanceTimersByTimeAsync(300);

        expect(modeler.getDefinitions).not.toHaveBeenCalled();
        expect(posted).toEqual([]);
    });

    it("publishes nothing once an engine reload began", async () => {
        const { posted, modeler, publisher, beginEngineReload } = publisherOn();

        publisher.schedule();
        beginEngineReload();
        await vi.advanceTimersByTimeAsync(300);
        publisher.schedule();
        await vi.advanceTimersByTimeAsync(300);

        expect(modeler.getDefinitions).not.toHaveBeenCalled();
        expect(posted).toEqual([]);
    });
});
