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
    const host = {
        postMessage: vi.fn(),
        getState: vi.fn(),
        setState: vi.fn(),
        updateState: vi.fn(),
    };
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

describe("deployment form env-reference hints", () => {
    it("documents ${env:MIRAGON_NAME} support in the auth and connection sections", () => {
        setup();
        const hints = Array.from(document.querySelectorAll(".hint")).map(
            (node) => node.textContent ?? "",
        );
        const envHints = hints.filter((text) => text.includes("${env:MIRAGON_NAME}"));
        expect(envHints.length).toBeGreaterThanOrEqual(3);
    });
});

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
        expect(document.getElementById("deploy-hint")?.textContent).toBe(
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

    it("creates a target from the entered form data and credentials on New", () => {
        const c = setup();
        c.form.setTargets(new DeploymentTargetsQuery([], ""));
        edit("endpoint", "https://edited.test");
        edit("target-name", "new");
        edit("auth-type", "basic", "change");
        edit("auth-username", "u");
        edit("auth-password", "p");
        button("target-new").click();
        const created = c.host.postMessage.mock.calls
            .map(([message]) => message)
            .find((message) => message.type === "CreateTargetCommand");
        expect(created).toBeDefined();
        expect(created.target).toMatchObject({ name: "new", endpoint: "https://edited.test" });
        expect(created.auth).toMatchObject({ authType: "basic", username: "u", password: "p" });
    });

    it("blocks New and shows a banner when the name is empty", () => {
        const c = setup();
        c.form.setTargets(new DeploymentTargetsQuery([], ""));
        edit("endpoint", "https://edited.test");
        expect(field("target-name").value).toBe("");
        button("target-new").click();
        expect(
            c.host.postMessage.mock.calls
                .map(([message]) => message)
                .some((message) => message.type === "CreateTargetCommand"),
        ).toBe(false);
        expect(document.getElementById("status-banner")?.textContent).toBe(
            "Target Name is required to create a target.",
        );
        expect(document.activeElement).toBe(field("target-name"));
    });

    it("disables Save when no target is selected", () => {
        const c = setup();
        c.form.setTargets(new DeploymentTargetsQuery([], ""));
        edit("endpoint", "https://edited.test");
        expect(button("target-save").disabled).toBe(true);
        expect(button("target-save").title).toBe(
            "Select a target to save changes, or use New to create one.",
        );
    });

    it("keeps the entered values when a create fails", () => {
        const c = setup();
        c.form.setTargets(new DeploymentTargetsQuery([], ""));
        edit("endpoint", "https://edited.test");
        edit("target-name", "dup");
        button("target-new").click();
        c.form.showTargetResult(false, 'A deployment target named "dup" already exists.');
        expect(field("target-name").value).toBe("dup");
        expect(field("endpoint").value).toBe("https://edited.test");
    });

    it("disables New while credentials are loading", () => {
        const c = setup();
        c.form.setTargets(
            new DeploymentTargetsQuery([target("dev", { authType: "basic" })], "dev"),
        );
        expect(button("target-new").disabled).toBe(true);
    });

    it("surfaces the deploy block reason at the button while keeping Save enabled", () => {
        const c = setup();
        const dev = target("dev");
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        edit("endpoint", "https://edited.test");
        expect(button("deploy-btn").disabled).toBe(true);
        expect(document.getElementById("deploy-hint")?.textContent).toBe(
            "Save target changes before deploying or starting an instance.",
        );
        expect(button("deploy-btn").title).toBe(
            "Save target changes before deploying or starting an instance.",
        );
        expect(button("target-save").disabled).toBe(false);
    });

    it("releases the credentials gate on a matching requestId for a different target", () => {
        const c = setup();
        const dev = target("dev", { authType: "basic" });
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        const request = c.lastRequest();
        expect(button("deploy-btn").disabled).toBe(true);
        c.form.populateCredentials(
            new StoredCredentialsQuery(
                { authType: "basic", username: "x", password: "y" },
                "stale-target",
                request.requestId,
            ),
        );
        expect(button("deploy-btn").disabled).toBe(false);
        expect(button("target-save").disabled).toBe(true);
        expect(field("auth-password").value).toBe("");
    });
});

describe("deployment form credential env references", () => {
    const SAVE_FIRST = "Save target changes before deploying or starting an instance.";
    const PASSWORD_REF = "${env:MIRAGON_PW}";

    function expectExecutionBlockedBy(reason: string | undefined) {
        expect({
            deployDisabled: button("deploy-btn").disabled,
            startDisabled: button("start-instance-btn").disabled,
            deployHint: document.getElementById("deploy-hint")?.textContent,
        }).toEqual({
            deployDisabled: reason !== undefined,
            startDisabled: reason !== undefined,
            deployHint: reason ?? "",
        });
    }

    function loadNamedBasicTarget(password: string) {
        const c = setup();
        const dev = target("dev", { authType: "basic" });
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        c.reply({ authType: "basic", username: "admin", password });
        expectExecutionBlockedBy(undefined);
        return { ...c, dev };
    }

    it.each([
        ["a literal to a ref", "s3cret", PASSWORD_REF],
        ["a ref to a literal", PASSWORD_REF, "s3cret"],
        ["a ref to another ref", PASSWORD_REF, "${env:MIRAGON_OTHER_PW}"],
        ["a ref to an empty value", PASSWORD_REF, ""],
    ])(
        "blocks a named target until saved when the password changes from %s",
        (_change, stored, edited) => {
            const c = loadNamedBasicTarget(stored);

            edit("auth-password", edited);

            expectExecutionBlockedBy(SAVE_FIRST);
            expect(() => c.form.getConfigPayload()).toThrow(SAVE_FIRST);
            expect(() => c.form.getConnectionPayload()).toThrow(SAVE_FIRST);
            expect(button("target-save").disabled).toBe(false);
        },
    );

    it.each([
        ["a literal to another literal", "s3cret", "n3w-s3cret"],
        ["a ref to the same ref padded with whitespace", PASSWORD_REF, `  ${PASSWORD_REF} `],
    ])(
        "keeps a named target executable when the password changes from %s",
        (_change, stored, edited) => {
            const c = loadNamedBasicTarget(stored);

            edit("auth-password", edited);

            expectExecutionBlockedBy(undefined);
            expect(c.form.getConfigPayload().auth).toEqual({
                authType: "basic",
                username: "admin",
                password: edited,
            });
        },
    );

    it.each<[string, AuthConfigPayload, string]>([
        ["username", { authType: "basic", username: "admin", password: "s3cret" }, "auth-username"],
        [
            "client id",
            { authType: "oauth2", clientId: "cid", clientSecret: "csecret" },
            "auth-client-id",
        ],
        [
            "client secret",
            { authType: "oauth2", clientId: "cid", clientSecret: "csecret" },
            "auth-client-secret",
        ],
    ])("blocks a named target until saved when the %s becomes a ref", (_field, stored, fieldId) => {
        const c = setup();
        const dev = target("dev", {
            authType: stored.authType,
            tokenEndpoint: stored.authType === "oauth2" ? "https://login.test/token" : undefined,
        });
        c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
        c.reply(stored);
        expectExecutionBlockedBy(undefined);

        edit(fieldId, "${env:MIRAGON_CREDENTIAL}");

        expectExecutionBlockedBy(SAVE_FIRST);
    });

    describe("when a literal is typed before the stored credentials arrive", () => {
        const TYPED_PASSWORD = "typed-literal";

        it("blocks once the reply reveals the saved ref without overwriting the typed literal", () => {
            const c = setup();
            c.form.setTargets(
                new DeploymentTargetsQuery([target("dev", { authType: "basic" })], "dev"),
            );
            edit("auth-password", TYPED_PASSWORD);
            expectExecutionBlockedBy(undefined);

            c.reply({ authType: "basic", username: "admin", password: PASSWORD_REF });

            expectExecutionBlockedBy(SAVE_FIRST);
            expect(() => c.form.getConfigPayload()).toThrow(SAVE_FIRST);
            expect(field("auth-username").value).toBe("");
            expect(field("auth-password").value).toBe(TYPED_PASSWORD);
            expect(button("target-save").disabled).toBe(false);

            edit("auth-password", PASSWORD_REF);
            expectExecutionBlockedBy(undefined);
        });

        it("ignores a ref reply to a superseded lookup of the same target", () => {
            const c = setup();
            const dev = target("dev", { authType: "basic" });
            c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
            const supersededRequest = c.lastRequest();
            c.form.setTargets(new DeploymentTargetsQuery([dev], "dev"));
            expect(c.lastRequest().requestId).not.toBe(supersededRequest.requestId);
            edit("auth-password", TYPED_PASSWORD);

            c.reply(
                { authType: "basic", username: "admin", password: PASSWORD_REF },
                supersededRequest,
            );

            expectExecutionBlockedBy(undefined);
            expect(field("auth-password").value).toBe(TYPED_PASSWORD);
        });

        it("ignores a ref reply for another target carrying the latest request id", () => {
            const c = setup();
            const targets = [
                target("dev", { authType: "basic" }),
                target("prod", { authType: "basic" }),
            ];
            c.form.setTargets(new DeploymentTargetsQuery(targets, "dev"));
            const latestRequest = c.lastRequest();
            edit("auth-password", TYPED_PASSWORD);

            c.form.populateCredentials(
                new StoredCredentialsQuery(
                    { authType: "basic", username: "admin", password: PASSWORD_REF },
                    "prod",
                    latestRequest.requestId,
                ),
            );

            expectExecutionBlockedBy(undefined);
            expect(field("auth-password").value).toBe(TYPED_PASSWORD);
        });
    });

    it("lifts the block when a ref edit is reverted to the populated value", () => {
        loadNamedBasicTarget("s3cret");

        edit("auth-password", PASSWORD_REF);
        expectExecutionBlockedBy(SAVE_FIRST);
        edit("auth-password", "s3cret");

        expectExecutionBlockedBy(undefined);
    });

    it.each([
        ["a literal to a ref", "s3cret", PASSWORD_REF],
        ["a ref to a literal", PASSWORD_REF, "s3cret"],
    ])(
        "never blocks an ad-hoc request when the password changes from %s",
        (_change, stored, edited) => {
            const c = setup();
            c.form.populate({ ...defaults, authType: "basic" });
            c.form.setTargets(new DeploymentTargetsQuery([], ""));
            c.reply({ authType: "basic", username: "admin", password: stored });

            edit("auth-password", edited);

            expectExecutionBlockedBy(undefined);
            expect(c.form.getConfigPayload()).toMatchObject({
                targetName: "",
                auth: { authType: "basic", username: "admin", password: edited },
            });
        },
    );

    it("clears the block once the saved target is reloaded with its credentials", () => {
        const c = loadNamedBasicTarget("s3cret");
        edit("auth-password", PASSWORD_REF);

        button("target-save").click();
        const saveCommand = c.host.postMessage.mock.calls
            .map(([message]) => message)
            .find((message) => message.type === "SaveTargetCommand");
        expect(saveCommand.auth).toEqual({
            authType: "basic",
            username: "admin",
            password: PASSWORD_REF,
        });
        c.form.showTargetResult(false, "Cannot write file");
        expectExecutionBlockedBy(SAVE_FIRST);

        button("target-save").click();
        c.form.showTargetResult(true, "Saved");
        c.form.setTargets(new DeploymentTargetsQuery([c.dev], "dev"));
        expectExecutionBlockedBy("Loading credentials…");
        c.reply({ authType: "basic", username: "admin", password: PASSWORD_REF });

        expectExecutionBlockedBy(undefined);
        expect(c.form.getConfigPayload().auth).toEqual({
            authType: "basic",
            username: "admin",
            password: PASSWORD_REF,
        });
    });
});
