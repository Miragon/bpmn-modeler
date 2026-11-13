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
import { VsCodeScriptEditor } from "./VsCodeScriptEditor";

/** The diagram already holds every script, so closing its editor writes nothing back. */
class DiagramHoldingEveryScript extends ScriptXmlService {
    override async applyScriptContents(): Promise<undefined> {
        return undefined;
    }
}

describeScriptEditorContract(
    "VsCodeScriptEditor",
    async ({ scriptFiles, settings, notifier }) => {
        resetVscodeEditorTabs((path) => scriptFiles.readFile(path));
        const scriptEditor = new VsCodeScriptEditor(
            scriptFiles,
            settings,
            notifier,
            new DiagramHoldingEveryScript(),
        );
        scriptEditor.register({ subscriptions: [] } as unknown as ExtensionContext);
        return {
            scriptEditor,
            openFileByUser,
            closeTabByUser: async (filePath) => closeTabByUser(filePath),
        };
    },
);
