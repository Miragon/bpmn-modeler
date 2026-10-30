import { describe, expect, it } from "vitest";

import { BPMN_EDITOR_COMMAND_TYPES } from "./bpmnEditorCommands";
import * as baseMessages from "./messages";
import { Command } from "./messages";
import * as modelerMessages from "./modeler";

type CommandClass = new () => Command;

const protocolCommandTypes = Object.values<unknown>({ ...baseMessages, ...modelerMessages })
    .filter(
        (value): value is CommandClass =>
            typeof value === "function" && value.prototype instanceof Command,
    )
    .map((Cls) => Reflect.construct(Cls, []).type)
    // The abstract LogMessageCommand fixes no type.
    .filter((type): type is string => type !== undefined);

const commandsOfOtherSurfaces = [
    "ViewportChangedCommand",
    "CursorChangedCommand",
    "DiffReadyCommand",
    "SwapCompareSidesCommand",
    "GetDmnFileCommand",
    "GetDmnModelerSettingCommand",
    "GetFormFileCommand",
    "GetFormInputValuesCommand",
    "GetElementTemplateFileCommand",
    "UpdateFormOutputValuesCommand",
    "RequestFormDefaultsCommand",
    "DeployCommand",
    "RequestAdditionalFilesCommand",
    "RequestStoredCredentialsCommand",
    "SelectTargetCommand",
    "SaveTargetCommand",
    "CreateTargetCommand",
    "DeleteTargetCommand",
    "OpenTargetsFileCommand",
    "StartInstanceCommand",
    "RequestPayloadFilesCommand",
    "RequestProcessDefinitionKeyCommand",
];

describe("BPMN_EDITOR_COMMAND_TYPES", () => {
    it("lists every command type at most once and only ProtocolCommandTypes", () => {
        const listed: readonly string[] = BPMN_EDITOR_COMMAND_TYPES;

        expect(listed).toEqual([...new Set(listed)]);
        expect(listed.filter((type) => !protocolCommandTypes.includes(type))).toEqual([]);
    });

    it("leaves out only the commands of the diff pane, the DMN and Form editors, the template preview and the deployment sidebar", () => {
        const listed: readonly string[] = BPMN_EDITOR_COMMAND_TYPES;
        const leftOut = protocolCommandTypes.filter((type) => !listed.includes(type));

        expect([...leftOut].sort()).toEqual([...commandsOfOtherSurfaces].sort());
    });
});
