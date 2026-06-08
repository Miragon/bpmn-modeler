import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoAuth } from "../domain/deployment";
import { StartInstanceConfig, StartInstanceResult } from "../domain/startInstance";
import { StartInstanceService } from "./StartInstanceService";
import { BpmnDocument } from "../../shared/domain/BpmnDocument";

// A real C7 document so `getProcessDefinitionKey` exercises the production
// `BpmnDocument.extractProcessId` regex against valid XML rather than a stub.
const C7_DOC = BpmnDocument.empty("c7", "7.24.0");

/**
 * Builds the service with structural port doubles. The service only ever calls
 * these methods, so bare `vi.fn()` records cast to the interfaces keep the test
 * free of any `vscode` surface. `ArtifactService` is concrete in production but
 * is doubled here the same way — the cast erases the nominal type.
 */
function createService() {
    const vsDocument = {
        getFilePath: vi.fn(),
        getContent: vi.fn(),
    };
    const vsWorkspace = {
        readFile: vi.fn(),
    };
    const restClient = {
        startInstance: vi.fn(),
    };
    const notifier = {
        showInfo: vi.fn(),
        logError: vi.fn(),
    };
    const picker = {
        pickPayloadFile: vi.fn(),
    };
    const artifactService = {
        getPayloadPaths: vi.fn(),
    };

    const service = new StartInstanceService(
        vsDocument as never,
        vsWorkspace as never,
        restClient as never,
        notifier as never,
        picker as never,
        artifactService as never,
    );

    return { service, vsDocument, vsWorkspace, restClient, notifier, picker, artifactService };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("StartInstanceService.getProcessDefinitionKey", () => {
    it("returns the process id extracted from the editor's BPMN content", () => {
        const { service, vsDocument } = createService();
        vsDocument.getContent.mockReturnValue(C7_DOC.xml);

        expect(service.getProcessDefinitionKey("editor-1")).toBe("Process_0gjrx3e");
        expect(vsDocument.getContent).toHaveBeenCalledWith("editor-1");
    });

    it("propagates the error when the content has no process element", () => {
        const { service, vsDocument } = createService();
        vsDocument.getContent.mockReturnValue("<bpmn:definitions/>");

        expect(() => service.getProcessDefinitionKey("editor-1")).toThrow();
    });
});

describe("StartInstanceService.selectPayloadFile", () => {
    it("shows an info notice and returns null when no payload files exist", async () => {
        const { service, vsDocument, artifactService, picker, notifier } = createService();
        vsDocument.getFilePath.mockReturnValue("/work/order.bpmn");
        artifactService.getPayloadPaths.mockResolvedValue([]);

        const result = await service.selectPayloadFile("editor-1");

        expect(result).toBeNull();
        expect(notifier.showInfo).toHaveBeenCalledOnce();
        expect(picker.pickPayloadFile).not.toHaveBeenCalled();
    });

    it("walks up from the document directory and delegates selection to the picker", async () => {
        const { service, vsDocument, artifactService, picker } = createService();
        vsDocument.getFilePath.mockReturnValue("/work/sub/order.bpmn");
        const payloads = ["/work/sub/payloads/a.json"];
        artifactService.getPayloadPaths.mockResolvedValue(payloads);
        const picked = { filePath: payloads[0], label: "a.json" };
        picker.pickPayloadFile.mockResolvedValue(picked);

        const result = await service.selectPayloadFile("editor-1");

        expect(result).toBe(picked);
        // Discovery starts from the document's directory, not the file path.
        expect(artifactService.getPayloadPaths).toHaveBeenCalledWith("/work/sub");
        expect(picker.pickPayloadFile).toHaveBeenCalledWith(payloads);
    });

    it("returns null when payloads exist but the user cancels the picker", async () => {
        const { service, vsDocument, artifactService, picker } = createService();
        vsDocument.getFilePath.mockReturnValue("/work/order.bpmn");
        artifactService.getPayloadPaths.mockResolvedValue(["/work/payloads/a.json"]);
        picker.pickPayloadFile.mockResolvedValue(null);

        await expect(service.selectPayloadFile("editor-1")).resolves.toBeNull();
    });
});

describe("StartInstanceService.startInstance", () => {
    it("reads and parses the payload, then forwards a parsed config to the REST client", async () => {
        const { service, vsWorkspace, restClient } = createService();
        vsWorkspace.readFile.mockResolvedValue('{"amount":42}');
        const success = new StartInstanceResult(true, "started", "pi-1");
        restClient.startInstance.mockResolvedValue(success);

        const result = await service.startInstance(
            "Process_0gjrx3e",
            "http://localhost:8080/engine-rest",
            "c7",
            new NoAuth(),
            "/work/payloads/a.json",
        );

        expect(result).toBe(success);
        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect(config.processDefinitionKey).toBe("Process_0gjrx3e");
        expect(config.payload).toEqual({ amount: 42 });
    });

    it("passes a null payload when no payload path is given and never reads a file", async () => {
        const { service, vsWorkspace, restClient } = createService();
        const success = new StartInstanceResult(true, "started", "pi-1");
        restClient.startInstance.mockResolvedValue(success);

        await service.startInstance("Process_1", "http://c/api", "c8", new NoAuth(), "");

        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect(config.payload).toBeNull();
        expect(vsWorkspace.readFile).not.toHaveBeenCalled();
    });

    it("passes a failed REST result straight through without logging", async () => {
        const { service, restClient, notifier } = createService();
        const failure = new StartInstanceResult(false, "rejected by server");
        restClient.startInstance.mockResolvedValue(failure);

        const result = await service.startInstance(
            "Process_1",
            "http://c/api",
            "c7",
            new NoAuth(),
            "",
        );

        expect(result).toBe(failure);
        expect(notifier.logError).not.toHaveBeenCalled();
    });

    it("never throws: a rejected REST call becomes a failed result and is logged", async () => {
        const { service, restClient, notifier } = createService();
        restClient.startInstance.mockRejectedValue(new Error("network down"));

        const result = await service.startInstance(
            "Process_1",
            "http://c/api",
            "c7",
            new NoAuth(),
            "",
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe("network down");
        expect(notifier.logError).toHaveBeenCalledOnce();
    });

    it("never throws: malformed payload JSON becomes a failed result and skips the REST call", async () => {
        const { service, vsWorkspace, restClient, notifier } = createService();
        vsWorkspace.readFile.mockResolvedValue("{ not json");

        const result = await service.startInstance(
            "Process_1",
            "http://c/api",
            "c7",
            new NoAuth(),
            "/work/payloads/bad.json",
        );

        expect(result.success).toBe(false);
        expect(restClient.startInstance).not.toHaveBeenCalled();
        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});
