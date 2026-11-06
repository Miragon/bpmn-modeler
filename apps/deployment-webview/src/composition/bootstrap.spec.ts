import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DeploymentTargetsQuery,
    HostApiImpl,
    ProcessDefinitionKeyQuery,
    SelectedPayloadFileQuery,
    StoredCredentialsQuery,
    type Command,
    type Query,
    type RequestStoredCredentialsCommand,
} from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../port/deploymentHost";
import { bootstrap } from "./bootstrap";

type Posted = { type: string } & Record<string, unknown>;

function fakeHost(savedState?: Record<string, unknown>) {
    return {
        getState: vi.fn(() => savedState),
        setState: vi.fn(),
        updateState: vi.fn(),
        postMessage: vi.fn(),
    };
}

const sentOfType = (host: { postMessage: ReturnType<typeof vi.fn> }, type: string): Posted[] =>
    host.postMessage.mock.calls
        .map(([message]) => message as Posted)
        .filter((message) => message.type === type);

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

const element = (id: string) => document.getElementById(id) as HTMLInputElement;
const tabButton = (tab: string) =>
    document.querySelector<HTMLButtonElement>(`.tab-btn[data-tab="${tab}"]`)!;
const isActive = (node: Element) => node.classList.contains("active");

describe("deployment webview bootstrap", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        document.body.innerHTML = '<div id="app"></div>';
    });

    afterEach(() => {
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("renders both forms and asks the host for the defaults", () => {
        const host = fakeHost();

        bootstrap(host as never);

        expect(element("deploy-btn")).not.toBeNull();
        expect(element("start-instance-btn")).not.toBeNull();
        expect(sentOfType(host, "RequestFormDefaultsCommand")).toHaveLength(1);
    });

    it("reports forms that cannot be built and requests nothing", () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        document.body.innerHTML = "";
        const host = fakeHost();

        bootstrap(host as never);

        expect(sentOfType(host, "LogErrorCommand")).toEqual([
            expect.objectContaining({
                message: expect.stringContaining("Failed to initialise deployment forms:"),
            }),
        ]);
        expect(sentOfType(host, "RequestFormDefaultsCommand")).toHaveLength(0);
    });

    it("routes host replies to the rendered forms", () => {
        bootstrap(fakeHost() as never);

        dispatch(new ProcessDefinitionKeyQuery("Order_Process"));
        dispatch(new SelectedPayloadFileQuery("/ws/payloads/order.json", "order.json"));

        expect(element("process-definition-key").value).toBe("Order_Process");
        expect(element("payload-file").value).toBe("order.json");
    });

    it("blocks starting an instance while the target's credentials load", () => {
        const host = fakeHost();
        bootstrap(host as never);
        const target = {
            name: "dev",
            endpoint: "https://dev.test",
            tenantId: "",
            engine: "c7" as const,
            authType: "basic" as const,
        };

        dispatch(new DeploymentTargetsQuery([target], "dev"));
        expect(element("start-instance-btn").disabled).toBe(true);

        const [lookup] = sentOfType(
            host,
            "RequestStoredCredentialsCommand",
        ) as unknown as RequestStoredCredentialsCommand[];
        dispatch(
            new StoredCredentialsQuery(
                { authType: "basic", username: "u", password: "p" },
                lookup.targetName,
                lookup.requestId,
            ),
        );
        expect(element("start-instance-btn").disabled).toBe(false);
    });

    describe("tabs", () => {
        it("switches to the clicked tab", () => {
            bootstrap(fakeHost() as never);

            tabButton("start-instance").click();

            expect(isActive(tabButton("start-instance"))).toBe(true);
            expect(isActive(element("tab-start-instance"))).toBe(true);
            expect(isActive(tabButton("deploy"))).toBe(false);
            expect(isActive(element("tab-deploy"))).toBe(false);
        });

        it("reopens the tab that was active before a reload", () => {
            bootstrap(fakeHost({ activeTab: "start-instance" }) as never);

            expect(isActive(tabButton("start-instance"))).toBe(true);
            expect(isActive(element("tab-deploy"))).toBe(false);
        });

        describe("against the production host API", () => {
            let persisted: WebviewState | undefined;

            beforeEach(() => {
                persisted = undefined;
                vi.stubGlobal("acquireVsCodeApi", () => ({
                    getState: () => persisted,
                    setState: (state: WebviewState) => {
                        persisted = state;
                    },
                    postMessage: vi.fn(),
                }));
            });

            afterEach(() => {
                vi.unstubAllGlobals();
            });

            const productionHost = () => new HostApiImpl<WebviewState, Command | Query>();

            it("remembers the first tab switch in a fresh webview", () => {
                const uncaught = vi.fn();
                window.addEventListener("error", uncaught);
                bootstrap(productionHost());

                tabButton("start-instance").click();

                expect(uncaught).not.toHaveBeenCalled();
                expect(persisted).toEqual({ activeTab: "start-instance" });
            });

            it("remembers the tab next to the other saved state", () => {
                persisted = { collapsedSections: ["advanced"] };
                bootstrap(productionHost());

                tabButton("start-instance").click();

                expect(persisted).toEqual({
                    collapsedSections: ["advanced"],
                    activeTab: "start-instance",
                });
            });

            it("keeps the active tab when a section is collapsed", () => {
                bootstrap(productionHost());
                tabButton("start-instance").click();

                document
                    .querySelector<HTMLElement>('.section-header[data-section="connection"]')!
                    .click();

                expect(persisted).toEqual({
                    activeTab: "start-instance",
                    collapsedSections: ["connection", "advanced"],
                });
            });
        });

        it("starts on the deploy tab on a first-ever open", () => {
            bootstrap(fakeHost() as never);

            expect(isActive(tabButton("deploy"))).toBe(true);
            expect(isActive(element("tab-start-instance"))).toBe(false);
        });
    });
});
