import { describe, expect, it } from "vitest";

import { EngineVersionStatus } from "../../../kernel/domain/BpmnDocument";
import { StatusView } from "../../../kernel/domain/statusView";
import { engineVersionStatusView } from "./engineVersionStatusView";

interface ViewCase {
    readonly name: string;
    readonly status: EngineVersionStatus | undefined;
    readonly view: StatusView | undefined;
}

const cases: ViewCase[] = [
    {
        name: "shows a Camunda 7 diagram's version with a click to change it",
        status: { platform: "c7", version: "7.22.0" },
        view: {
            text: "Camunda 7 (7.22.0)",
            icon: "engine",
            tooltip: "Click to change engine version",
            tone: "neutral",
            action: "changeEngineVersion",
        },
    },
    {
        name: "shows a Camunda 8 diagram's version with a click to change it",
        status: { platform: "c8", version: "8.8.0" },
        view: {
            text: "Camunda 8 (8.8.0)",
            icon: "engine",
            tooltip: "Click to change engine version",
            tone: "neutral",
            action: "changeEngineVersion",
        },
    },
    {
        name: "hides the item when the diagram has no engine version",
        status: undefined,
        view: undefined,
    },
];

describe("engineVersionStatusView", () => {
    it.each(cases)("$name", ({ status, view }) => {
        expect(engineVersionStatusView(status)).toEqual(view);
    });
});
