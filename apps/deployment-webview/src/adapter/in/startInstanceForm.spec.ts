import { afterEach, describe, expect, it, vi } from "vitest";

import { StartInstanceResultQuery } from "@miragon/bpmn-modeler-shared";

import type { AuthFields } from "../../domain/deploymentDraft";
import { FORM_TEMPLATE } from "./formTemplate";
import { StartInstanceForm } from "./startInstanceForm";

type Posted = { type: string } & Record<string, unknown>;

const noAuth: AuthFields = {
    authType: "none",
    username: "",
    password: "",
    clientId: "",
    clientSecret: "",
    tokenEndpoint: "",
    audience: "",
};

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const startButton = () => document.getElementById("start-instance-btn") as HTMLButtonElement;
const banner = () => document.getElementById("start-status-banner") as HTMLDivElement;

function setup(
    connection = { endpoint: "https://engine.test", startInstanceUrl: "https://s" },
    auth: AuthFields = noAuth,
) {
    document.body.innerHTML = FORM_TEMPLATE;
    const host = { postMessage: vi.fn() };
    const form = new StartInstanceForm(
        host,
        () => auth,
        () => ({ engine: "c8", targetName: "dev", ...connection }),
    );
    const sent = (type: string) =>
        host.postMessage.mock.calls
            .map(([message]) => message as Posted)
            .filter((message) => message.type === type);
    return { form, host, sent };
}

function typeKey(value: string): void {
    input("process-definition-key").value = value;
}

describe("StartInstanceForm", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("starts the trimmed key with the shared connection and the chosen payload file", () => {
        const { form, sent } = setup();
        form.setPayloadFile("/ws/payloads/order.json", "order.json");
        typeKey("  Order_Process  ");

        startButton().click();

        expect(input("payload-file").value).toBe("order.json");
        expect(sent("StartInstanceCommand")).toEqual([
            expect.objectContaining({
                config: {
                    processDefinitionKey: "Order_Process",
                    endpoint: "https://engine.test",
                    engine: "c8",
                    auth: { authType: "none" },
                    payloadFilePath: "/ws/payloads/order.json",
                    targetName: "dev",
                    startInstanceUrl: "https://s",
                },
            }),
        ]);
    });

    it("starts with the shared Basic auth, the username trimmed and the password as typed", () => {
        const { sent } = setup(undefined, {
            ...noAuth,
            authType: "basic",
            username: " admin ",
            password: " s3cret ",
        });
        typeKey("Order_Process");

        startButton().click();

        expect(sent("StartInstanceCommand")[0].config).toMatchObject({
            auth: { authType: "basic", username: "admin", password: " s3cret " },
        });
    });

    it("starts without a payload once the selection is cleared", () => {
        const { form, sent } = setup();
        form.setPayloadFile("/ws/payloads/order.json", "order.json");
        form.setPayloadFile("", "");
        typeKey("Order_Process");

        startButton().click();

        expect(input("payload-file").value).toBe("(none)");
        expect(sent("StartInstanceCommand")[0].config).toMatchObject({ payloadFilePath: "" });
    });

    it("shows progress and locks the button until the host reports back", () => {
        const { form } = setup();
        typeKey("Order_Process");

        startButton().click();

        expect(startButton().disabled).toBe(true);
        expect(banner().className).toBe("status-banner progress");
        expect(banner().textContent).toBe("Starting process instance…");
        expect(banner().style.display).toBe("block");

        form.showResult(new StartInstanceResultQuery(true, "Started", "42"));

        expect(startButton().disabled).toBe(false);
        expect(banner().className).toBe("status-banner success");
        expect(banner().textContent).toBe("Started (ID: 42)");
    });

    it("shows a failed start without an instance id", () => {
        const { form } = setup();
        typeKey("Order_Process");
        startButton().click();

        form.showResult(new StartInstanceResultQuery(false, "Engine refused", "42"));

        expect(banner().className).toBe("status-banner error");
        expect(banner().textContent).toBe("Engine refused");
    });

    it("clears the progress without a result banner when the host reports the start cancelled", () => {
        const { form } = setup();
        typeKey("Order_Process");
        startButton().click();

        form.showResult(
            new StartInstanceResultQuery(false, "Instance start cancelled.", undefined, true),
        );

        expect(startButton().disabled).toBe(false);
        expect(banner().style.display).toBe("none");
        expect(banner().textContent).toBe("");
    });

    it("keeps the button locked while starting even when the target becomes ready", () => {
        const { form } = setup();
        typeKey("Order_Process");
        startButton().click();

        form.setExecutionBlockedReason(undefined);

        expect(startButton().disabled).toBe(true);
    });

    const basicWithoutUsername: AuthFields = { ...noAuth, authType: "basic", password: "p" };

    it.each<[string, string, string, AuthFields, string]>([
        [
            "a blank process definition key",
            "   ",
            "https://engine.test",
            basicWithoutUsername,
            "Process Definition Key is required.",
        ],
        [
            "no REST endpoint",
            "Order_Process",
            "",
            basicWithoutUsername,
            "REST endpoint is required.",
        ],
        [
            "Basic auth without a username",
            "Order_Process",
            "https://engine.test",
            basicWithoutUsername,
            "Username is required for Basic Auth.",
        ],
        [
            "OAuth2 without a client secret",
            "Order_Process",
            "https://engine.test",
            {
                ...noAuth,
                authType: "oauth2",
                clientId: "client",
                tokenEndpoint: "https://login.test/token",
            },
            "Client Secret is required for OAuth2.",
        ],
    ])("refuses to start with %s", (_, key, endpoint, auth, problem) => {
        const { sent } = setup({ endpoint, startInstanceUrl: "https://s" }, auth);
        typeKey(key);

        startButton().click();

        expect(banner().className).toBe("status-banner error");
        expect(banner().textContent).toBe(problem);
        expect(sent("StartInstanceCommand")).toEqual([]);
        expect(sent("LogInfoCommand")).toEqual([
            expect.objectContaining({
                message: `Start-instance form validation failed: ${problem}`,
            }),
        ]);
        expect(startButton().disabled).toBe(false);
    });

    it("asks the host to pick a payload file", () => {
        const { sent } = setup();

        (document.getElementById("select-payload-btn") as HTMLButtonElement).click();

        expect(sent("RequestPayloadFilesCommand")).toHaveLength(1);
    });

    it("fails fast when rendered without the form markup", () => {
        expect(
            () =>
                new StartInstanceForm(
                    { postMessage: vi.fn() },
                    () => noAuth,
                    () => ({ endpoint: "", engine: "c7", targetName: "" }),
                ),
        ).toThrow("Required DOM element not found: #process-definition-key");
    });
});
