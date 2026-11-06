import { vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeEditorTabsFake"));

import { ExtensionContext } from "vscode";

import { ScriptXmlService } from "@miragon/bpmn-modeler-core";
import { describeScriptEditorContract } from "@miragon/bpmn-modeler-core/testing";

import {
    closeTabByUser,
    openFileByUser,
    resetVscodeEditorTabs,
} from "../../../__fixtures__/vscodeEditorTabsFake";
import { ScriptTaskService } from "./ScriptTaskService";

/** The diagram already holds every script, so closing its editor writes nothing back. */
class DiagramHoldingEveryScript extends ScriptXmlService {
    override async applyScriptContents(): Promise<undefined> {
        return undefined;
    }
}

describeScriptEditorContract(
    "ScriptTaskService",
    async ({ store, scriptFiles, settings, notifier, picker }) => {
        resetVscodeEditorTabs((path) => scriptFiles.readFile(path));
        const service = new ScriptTaskService(
            store,
            scriptFiles,
            settings,
            notifier,
            picker,
            new DiagramHoldingEveryScript(),
        );
        service.register({ subscriptions: [] } as unknown as ExtensionContext);
        return {
            scriptEditor: service,
            openFileByUser,
            closeTab: async (filePath) => closeTabByUser(filePath),
        };
    },
);
