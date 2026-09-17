import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    DeploymentResultQuery,
    DeploymentTargetsQuery,
    RequestStoredCredentialsCommand,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    type AuthConfigPayload,
    type DeploymentTargetPayload,
} from "@miragon/bpmn-modeler-shared";
import { DeploymentForm } from "./form";
import { FORM_TEMPLATE } from "./formTemplate";
import { StartInstanceForm } from "./startInstanceForm";

const defaults = {
    deploymentName: "order",
    endpoint: "https://adhoc.test",
    tenantId: "",
    engine: "c7" as const,
    authType: "none" as const,
};
const target = (
    name: string,
    extra: Partial<DeploymentTargetPayload> = {},
): DeploymentTargetPayload => ({
    name,
    endpoint: `https://${name}.test`,
    tenantId: "",
    engine: "c7",
    authType: "none",
    ...extra,
});
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
function edit(id: string, value: string, event = "input") {
    field(id).value = value;
    field(id).dispatchEvent(new Event(event));
}

function setup() {
    document.body.innerHTML = FORM_TEMPLATE;
    const host = { postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() };
    const form = new DeploymentForm(host as never);
    const start = new StartInstanceForm(
        host as never,
        () => form.getAuthPayload(),
        () => form.getConnectionPayload(),
    );
    form.onExecutionReadinessChange((reason) => start.setExecutionBlockedReason(reason));
    start.setProcessDefinitionKey("order");
    form.populate(defaults);
    function reply(auth: AuthConfigPayload, request?: RequestStoredCredentialsCommand) {
        request ??= host.postMessage.mock.calls
            .map(([message]) => message)
            .filter((message) => message.type === "RequestStoredCredentialsCommand")
            .at(-1);
        form.populateCredentials(
            new StoredCredentialsQuery(auth, request!.targetName, request!.requestId),
        );
    }
    function lastRequest(): RequestStoredCredentialsCommand {
        return host.postMessage.mock.calls
            .map(([message]) => message)
            .filter((message) => message.type === "RequestStoredCredentialsCommand")
            .at(-1);
    }
    return { form, start, host, reply, lastRequest };
}

beforeEach(() => vi.clearAllMocks());

describe("deployment target form", () => {
    it("restores the latest ad-hoc defaults and clears both target overrides", () => {
        const { form } = setup();
        const prod = target("prod", {
            deployUrl: "https://prod.test/deploy",
            startInstanceUrl: "https://prod.test/start",
        });
        form.setTargets(new DeploymentTargetsQuery([prod], "prod"));
        form.populate({ ...defaults, endpoint: "https://new-adhoc.test" });
        edit("target-select", "", "change");
        form.setTargets(new DeploymentTargetsQuery([prod], ""));
        expect(form.getConfigPayload()).toMatchObject({
            endpoint: "https://new-adhoc.test",
            targetName: "",
            deployUrl: undefined,
        });
        expect(form.getConnectionPayload().startInstanceUrl).toBeUndefined();
        expect(field("target-name").value).toBe("");
    });

    it("clears secrets and blocks both actions until the current lookup completes", () => {
        const c = setup();
        const targets = [target("a", { authType: "basic" }), target("b", { authType: "basic" })];
        c.form.setTargets(new DeploymentTargetsQuery(targets, "a"));
        c.reply({ authType: "basic", username: "a", password: "secret-a" });
        edit("target-select", "b", "change");
        expect(field("auth-password").value).toBe("");
        expect(button("deploy-btn").disabled).toBe(true);
        expect(button("start-instance-btn").disabled).toBe(true);
        c.form.setTargets(new DeploymentTargetsQuery(targets, "b"));
        expect(() => c.form.getConfigPayload()).toThrow("Loading credentials");
        c.reply({ authType: "basic", username: "b", password: "secret-b" });
        expect(c.form.getConfigPayload().auth).toMatchObject({
            username: "b",
            password: "secret-b",
        });
        expect(button("start-instance-btn").disabled).toBe(false);
    });

    it("ignores late successful and failed replies, including a previous lookup of the same target", () => {
        const c = setup();
        const targets = [target("a", { authType: "basic" }), target("b", { authType: "basic" })];
        c.form.setTargets(new DeploymentTargetsQuery(targets, "a"));
        const oldA = c.lastRequest();
        c.form.setTargets(new DeploymentTargetsQuery(targets, "b"));
        const oldB = c.lastRequest();
        c.form.setTargets(new DeploymentTargetsQuery(targets, "a"));
        c.reply({ authType: "basic", username: "current", password: "current" });
        c.reply({ authType: "basic", username: "stale", password: "stale" }, oldA);
        c.reply({ authType: "none" }, oldB);
        expect(c.form.getConfigPayload().auth).toMatchObject({
            username: "current",
            password: "current",
        });
    });

    it("keeps shared OAuth metadata when credentials are absent or unavailable", () => {
        const c = setup();
        const oauth = target("oauth", {
            authType: "oauth2",
            tokenEndpoint: "https://login.test/token",
            audience: "api",
        });
        c.form.setTargets(new DeploymentTargetsQuery([oauth], "oauth"));
        c.reply({ authType: "oauth2" });
        edit("auth-client-id", "client");
        edit("auth-client-secret", "secret");
        expect(c.form.getConfigPayload().auth).toMatchObject({
            tokenEndpoint: oauth.tokenEndpoint,
            audience: "api",
        });
    });

    it("requires saving connection edits in both tabs and preserves the draft on refresh and failure", () => {
        const c = setup();
        const dev = target("dev");
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        edit("endpoint", "https://edited.test");
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        expect(field("endpoint").value).toBe("https://edited.test");
        c.form.showResult(new DeploymentResultQuery(true, "old operation finished"));
        c.start.showResult(new StartInstanceResultQuery(true, "old operation finished"));
        expect(button("deploy-btn").disabled).toBe(true);
        expect(button("start-instance-btn").disabled).toBe(true);
        expect(document.getElementById("execution-hint")?.textContent).toBe(
            "Save target changes before deploying or starting an instance.",
        );
        button("target-save").click();
        c.form.showTargetResult(false, "Cannot write file");
        expect(field("endpoint").value).toBe("https://edited.test");
        expect(button("target-save").disabled).toBe(false);
        expect(button("deploy-btn").disabled).toBe(true);
        button("target-save").click();
        c.form.showTargetResult(true, "Saved");
        c.form.setTargets(
            new DeploymentTargetsQuery([{ ...dev, endpoint: "https://edited.test" }], "dev"),
        );
        expect(button("deploy-btn").disabled).toBe(false);
        expect(button("start-instance-btn").disabled).toBe(false);
    });

    it("allows credential-only edits without saving and preserves them on redundant refresh", () => {
        const c = setup();
        const dev = target("dev", { authType: "basic" });
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        c.reply({ authType: "basic", username: "u", password: "old" });
        edit("auth-password", "new");
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        expect(c.form.getConfigPayload().auth.password).toBe("new");
        expect(button("start-instance-btn").disabled).toBe(false);
        expect(button("target-save").disabled).toBe(false);
    });

    it("does not carry a dirty credential draft into another document context", () => {
        const c = setup();
        const dev = target("dev", { authType: "basic" });
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev", "/one"));
        c.reply({ authType: "basic", username: "u", password: "old" });
        edit("auth-password", "draft");
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev", "/two"));
        expect(field("auth-password").value).toBe("");
        expect(button("deploy-btn").disabled).toBe(true);
    });

    it("invalidates lookups on authentication-method changes without fetching the old method", () => {
        const c = setup();
        c.form.setTargets(
            new DeploymentTargetsQuery([target("dev", { authType: "basic" })], "dev"),
        );
        const request = c.lastRequest();
        c.host.postMessage.mockClear();
        edit("auth-type", "oauth2", "change");
        c.reply({ authType: "basic", username: "old", password: "old" }, request);
        expect(field("auth-password").value).toBe("");
        expect(c.host.postMessage).not.toHaveBeenCalled();
        expect(button("deploy-btn").disabled).toBe(true);
    });

    it("requires saving a new target and keeps it through a redundant refresh", () => {
        const c = setup();
        const dev = target("dev");
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        button("target-new").click();
        edit("target-name", "new");
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        expect(field("target-name").value).toBe("new");
        expect(button("deploy-btn").disabled).toBe(true);
    });
});
