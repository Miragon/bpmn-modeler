import { beforeEach, describe, expect, it, vi } from "vitest";

// The participant touches the `vscode` value namespace (`Uri.parse`) to split
// the editor URI into scheme + fs path, so the factory supplies a stand-in that
// mirrors VS Code decoding a `file://` string (follows the modes-spec style).
vi.mock("vscode", () => ({
    Uri: {
        parse: (value: string) => {
            const path = decodeURIComponent(value.replace(/^file:\/\//, ""));
            return { scheme: value.startsWith("file:") ? "file" : "untitled", fsPath: path };
        },
    },
}));

import { ScriptVariableManifestService, ScriptVariableStore } from "@miragon/bpmn-modeler-core";
import { VariableDef } from "@miragon/bpmn-modeler-shared";
import { EditorSessionContext } from "@miragon/bpmn-modeler-core";
import { RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";
import { ScriptManifestParticipant } from "./ScriptManifestParticipant";

const EDITOR_ID = "file:///work/diagram.bpmn";
const DOCUMENT_PATH = "/work/diagram.bpmn";
const MANIFEST_PATH = "/work/.camunda/vars/diagram.bpmn.vars.json";

const VARIABLE: VariableDef = {
    name: "orderId",
    origin: "declared in diagram.bpmn.vars.json",
    typeHint: "String",
    description: undefined,
    confidence: "authored",
};

function createContext(isCurrent: () => boolean = () => true): EditorSessionContext {
    return {
        editorId: EDITOR_ID,
        isCurrent,
        isFocused: () => true,
        onFocusChange: vi.fn(),
        onReseed: vi.fn(),
        onDocumentChange: vi.fn(),
        onSettingChange: vi.fn(),
        onDispose: vi.fn(),
        addDisposable: vi.fn(),
    };
}

describe("ScriptManifestParticipant", () => {
    let manifestSvc: {
        loadWithStatus: ReturnType<typeof vi.fn>;
        createWatcher: ReturnType<typeof vi.fn>;
    };
    let store: { setManifest: ReturnType<typeof vi.fn> };
    let notifier: RecordingNotifier;

    beforeEach(() => {
        manifestSvc = {
            loadWithStatus: vi.fn(),
            createWatcher: vi.fn().mockResolvedValue({ dispose: vi.fn() }),
        };
        store = { setManifest: vi.fn() };
        notifier = new RecordingNotifier();
    });

    function participant(): ScriptManifestParticipant {
        return new ScriptManifestParticipant(
            manifestSvc as unknown as ScriptVariableManifestService,
            store as unknown as ScriptVariableStore,
            notifier,
        );
    }

    it("stores the variables and logs the resolved path when a manifest is found", async () => {
        manifestSvc.loadWithStatus.mockResolvedValue({
            manifestPath: MANIFEST_PATH,
            found: true,
            variables: [VARIABLE],
        });

        await participant().onResolve(createContext());

        expect(store.setManifest).toHaveBeenCalledWith(EDITOR_ID, [VARIABLE]);
        expect(notifier.logged("info")).toEqual([
            `Variable manifest loaded: ${MANIFEST_PATH} (1 variable(s))`,
        ]);
        expect(notifier.errors).toEqual([]);
    });

    it("logs the lookup path when no manifest exists (so a mislocation is debuggable)", async () => {
        manifestSvc.loadWithStatus.mockResolvedValue({
            manifestPath: MANIFEST_PATH,
            found: false,
            variables: [],
        });

        await participant().onResolve(createContext());

        expect(store.setManifest).toHaveBeenCalledWith(EDITOR_ID, []);
        expect(notifier.logged("info")).toEqual([`No variable manifest at ${MANIFEST_PATH}`]);
    });

    it("surfaces a read error and leaves the store untouched", async () => {
        const error = new Error("EACCES");
        manifestSvc.loadWithStatus.mockRejectedValue(error);

        await participant().onResolve(createContext());

        expect(notifier.errors).toEqual(["Failed to read process-variable manifest\nEACCES"]);
        expect(store.setManifest).not.toHaveBeenCalled();
    });

    it("ignores a non-file editor (a diff/untitled URI has no manifest on disk)", async () => {
        const context = { ...createContext(), editorId: "untitled:Untitled-1" };

        await participant().onResolve(context);

        expect(manifestSvc.loadWithStatus).not.toHaveBeenCalled();
        expect(manifestSvc.createWatcher).not.toHaveBeenCalled();
    });

    it("registers a watcher that reloads the manifest on change", async () => {
        manifestSvc.loadWithStatus.mockResolvedValue({
            manifestPath: MANIFEST_PATH,
            found: false,
            variables: [],
        });
        const context = createContext();

        await participant().onResolve(context);

        expect(manifestSvc.createWatcher).toHaveBeenCalledWith(DOCUMENT_PATH, expect.any(Function));
        expect(context.addDisposable).toHaveBeenCalled();

        // The watcher callback must re-drive reload so a live manifest edit is picked up.
        manifestSvc.loadWithStatus.mockClear();
        const onChange = manifestSvc.createWatcher.mock.calls[0][1] as () => void;
        onChange();
        await vi.waitFor(() => expect(manifestSvc.loadWithStatus).toHaveBeenCalled());
    });

    it("does not apply a manifest loaded for a replaced session", async () => {
        let finishLoad: (result: {
            manifestPath: string;
            found: boolean;
            variables: VariableDef[];
        }) => void = () => {};
        manifestSvc.loadWithStatus.mockReturnValue(
            new Promise((resolve) => {
                finishLoad = resolve;
            }),
        );
        let current = true;
        const resolving = participant().onResolve(createContext(() => current));

        current = false;
        finishLoad({ manifestPath: MANIFEST_PATH, found: true, variables: [VARIABLE] });
        await resolving;

        expect(store.setManifest).not.toHaveBeenCalled();
        expect(notifier.logged("info")).toEqual([]);
        expect(manifestSvc.createWatcher).not.toHaveBeenCalled();
    });
});
