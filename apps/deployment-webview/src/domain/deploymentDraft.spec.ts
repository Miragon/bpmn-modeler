import { describe, expect, it } from "vitest";
import type { AuthConfigPayload, AuthTypePayload } from "@miragon/bpmn-modeler-shared";
import {
    type AuthFields,
    authPayloadOf,
    credentialRefSignatureOf,
    type DraftActivity,
    type DraftControls,
    type DraftSnapshot,
    draftControls,
    executionBlockedReason,
    requestAuthOf,
    saveBlockedReason,
} from "./deploymentDraft";

const SAVING = "Saving deployment target…";
const LOADING_TARGET = "Loading deployment target…";
const LOADING_CREDENTIALS = "Loading credentials…";
const SAVE_FIRST = "Save target changes before deploying or starting an instance.";
const NO_TARGET = "Select a target to save changes, or use New to create one.";
const NO_CHANGES = "No unsaved changes.";

const idleNamedDraft: DraftSnapshot = {
    activity: "idle",
    editingTargetName: "dev",
    dirty: true,
    credentialsPending: false,
    targetDefinitionChanged: false,
};
const draft = (overrides: Partial<DraftSnapshot>): DraftSnapshot => ({
    ...idleNamedDraft,
    ...overrides,
});

const ACTIVITIES: DraftActivity[] = ["idle", "switchingTarget", "reloadingTarget", "savingTarget"];
const everyDraft: DraftSnapshot[] = ACTIVITIES.flatMap((activity) =>
    ["", "dev"].flatMap((editingTargetName) =>
        [false, true].flatMap((dirty) =>
            [false, true].flatMap((credentialsPending) =>
                [false, true].map((targetDefinitionChanged) => ({
                    activity,
                    editingTargetName,
                    dirty,
                    credentialsPending,
                    targetDefinitionChanged,
                })),
            ),
        ),
    ),
);

describe("executionBlockedReason", () => {
    it.each<[string, Partial<DraftSnapshot>, string | undefined]>([
        ["an idle, saved target", {}, undefined],
        ["a save in flight", { activity: "savingTarget", credentialsPending: true }, SAVING],
        ["a target switch", { activity: "switchingTarget" }, LOADING_TARGET],
        ["a saved target reloading", { activity: "reloadingTarget" }, LOADING_TARGET],
        [
            "a credential lookup",
            { credentialsPending: true, targetDefinitionChanged: true },
            LOADING_CREDENTIALS,
        ],
        ["unsaved target changes", { targetDefinitionChanged: true }, SAVE_FIRST],
        [
            "ad-hoc values that differ",
            { editingTargetName: "", targetDefinitionChanged: true },
            undefined,
        ],
    ])("blocks Deploy for %s", (_, overrides, reason) => {
        expect(executionBlockedReason(draft(overrides))).toBe(reason);
    });
});

describe("saveBlockedReason", () => {
    it.each<[string, Partial<DraftSnapshot>, string | undefined]>([
        ["an idle, edited target", {}, undefined],
        ["an ad-hoc form", { editingTargetName: "", activity: "savingTarget" }, NO_TARGET],
        ["an unedited target", { dirty: false, activity: "savingTarget" }, NO_CHANGES],
        ["a save in flight", { activity: "savingTarget", credentialsPending: true }, SAVING],
        ["a target switch", { activity: "switchingTarget" }, LOADING_TARGET],
        ["a saved target reloading", { activity: "reloadingTarget" }, LOADING_TARGET],
        ["a credential lookup", { credentialsPending: true }, LOADING_CREDENTIALS],
        ["unsaved target changes", { targetDefinitionChanged: true }, undefined],
    ])("blocks Save for %s", (_, overrides, reason) => {
        expect(saveBlockedReason(draft(overrides))).toBe(reason);
    });
});

describe("draftControls", () => {
    it.each(everyDraft)(
        "disables Save exactly when it shows a reason ($activity, target '$editingTargetName', dirty $dirty, credentials pending $credentialsPending, definition changed $targetDefinitionChanged)",
        (snapshot) => {
            const reason = saveBlockedReason(snapshot);
            expect(draftControls(snapshot)).toMatchObject({
                saveDisabled: reason !== undefined,
                saveTitle: reason ?? "Save target",
            });
        },
    );

    it.each<[DraftActivity, boolean, string]>([
        ["idle", false, "Save target"],
        ["switchingTarget", true, LOADING_TARGET],
        ["reloadingTarget", true, LOADING_TARGET],
        ["savingTarget", true, SAVING],
    ])("locks every target action while %s", (activity, locked, saveTitle) => {
        expect(draftControls(draft({ activity }))).toEqual({
            saveDisabled: locked,
            saveTitle,
            selectDisabled: locked,
            newDisabled: locked,
            deleteDisabled: locked,
            inputsDisabled: locked,
        });
    });

    it.each<[string, Partial<DraftSnapshot>, Partial<DraftControls>]>([
        [
            "a credential lookup blocks New but not the select, Delete or the inputs",
            { credentialsPending: true },
            {
                newDisabled: true,
                selectDisabled: false,
                deleteDisabled: false,
                inputsDisabled: false,
            },
        ],
        [
            "an ad-hoc form has nothing to delete but can create",
            { editingTargetName: "" },
            { deleteDisabled: true, newDisabled: false },
        ],
    ])("%s", (_, overrides, controls) => {
        expect(draftControls(draft(overrides))).toMatchObject(controls);
    });
});

describe("credentialRefSignatureOf", () => {
    const PASSWORD_REF = "${env:MIRAGON_PW}";
    type Credentials = (string | undefined)[];
    const signaturesDiffer = (saved: Credentials, current: Credentials): boolean =>
        credentialRefSignatureOf(saved) !== credentialRefSignatureOf(current);

    it.each<[string, Credentials, Credentials]>([
        ["a reference replacing a literal", ["user", "secret"], ["user", PASSWORD_REF]],
        ["a literal replacing a reference", ["user", PASSWORD_REF], ["user", "secret"]],
        ["a reference to another reference", [PASSWORD_REF], ["${env:MIRAGON_OTHER_PW}"]],
        ["a reference inside a literal", ["user"], ["user-${env:MIRAGON_SUFFIX}"]],
        ["the same reference in another field", [PASSWORD_REF, ""], ["", PASSWORD_REF]],
    ])("counts %s as a target change", (_, saved, current) => {
        expect(signaturesDiffer(saved, current)).toBe(true);
    });

    it.each<[string, Credentials, Credentials]>([
        ["a literal edit", ["user", "secret"], ["user", "other"]],
        ["a literal filling an empty field", [undefined, ""], ["user", "secret"]],
        ["whitespace around a reference", [PASSWORD_REF], [`  ${PASSWORD_REF} `]],
    ])("leaves %s free", (_, saved, current) => {
        expect(signaturesDiffer(saved, current)).toBe(false);
    });
});

describe("authPayloadOf", () => {
    const typed: AuthFields = {
        authType: "none",
        username: " user ",
        password: " pass ",
        clientId: " client ",
        clientSecret: " secret ",
        tokenEndpoint: " https://login.test/token ",
        audience: " api ",
    };

    it.each<[AuthTypePayload, AuthConfigPayload]>([
        ["none", { authType: "none" }],
        ["basic", { authType: "basic", username: "user", password: " pass " }],
        [
            "oauth2",
            {
                authType: "oauth2",
                clientId: "client",
                clientSecret: " secret ",
                tokenEndpoint: "https://login.test/token",
                audience: "api",
            },
        ],
    ])("sends only the %s fields, trimmed except for the secrets", (authType, payload) => {
        expect(authPayloadOf({ ...typed, authType })).toEqual(payload);
    });
});

describe("requestAuthOf", () => {
    const ENDPOINT = "https://engine.test";
    const ENDPOINT_REQUIRED = "REST endpoint is required.";
    const USERNAME = "Username is required for Basic Auth.";
    const PASSWORD = "Password is required for Basic Auth.";
    const CLIENT_ID = "Client ID is required for OAuth2.";
    const CLIENT_SECRET = "Client Secret is required for OAuth2.";
    const TOKEN_ENDPOINT = "Token Endpoint is required for OAuth2.";
    const complete: AuthFields = {
        authType: "none",
        username: "user",
        password: "pass",
        clientId: "client",
        clientSecret: "secret",
        tokenEndpoint: "https://login.test/token",
        audience: "",
    };
    const empty = {
        username: "",
        password: "",
        clientId: "",
        clientSecret: "",
        tokenEndpoint: "",
        audience: "",
    };
    const reasonOf = (request: ReturnType<typeof requestAuthOf>) =>
        "reason" in request ? request.reason : undefined;

    it.each<[string, Partial<AuthFields>, string | undefined]>([
        ["no auth with every field empty", { authType: "none", ...empty }, undefined],
        ["complete Basic auth", { authType: "basic" }, undefined],
        ["Basic auth without a username", { authType: "basic", username: "" }, USERNAME],
        ["Basic auth with a blank username", { authType: "basic", username: "   " }, USERNAME],
        ["Basic auth without a password", { authType: "basic", password: "" }, PASSWORD],
        ["Basic auth with a password of spaces", { authType: "basic", password: "  " }, undefined],
        ["Basic auth with every field empty", { authType: "basic", ...empty }, USERNAME],
        [
            "Basic auth without the OAuth2 fields",
            { authType: "basic", ...empty, username: "user", password: "pass" },
            undefined,
        ],
        ["complete OAuth2 without an audience", { authType: "oauth2" }, undefined],
        ["OAuth2 without a client ID", { authType: "oauth2", clientId: "" }, CLIENT_ID],
        ["OAuth2 with a blank client ID", { authType: "oauth2", clientId: "   " }, CLIENT_ID],
        ["OAuth2 without a client secret", { authType: "oauth2", clientSecret: "" }, CLIENT_SECRET],
        [
            "OAuth2 with a client secret of spaces",
            { authType: "oauth2", clientSecret: "  " },
            undefined,
        ],
        [
            "OAuth2 without a token endpoint",
            { authType: "oauth2", tokenEndpoint: "" },
            TOKEN_ENDPOINT,
        ],
        [
            "OAuth2 with a blank token endpoint",
            { authType: "oauth2", tokenEndpoint: " " },
            TOKEN_ENDPOINT,
        ],
        [
            "OAuth2 with only the client ID",
            { authType: "oauth2", ...empty, clientId: "client" },
            CLIENT_SECRET,
        ],
        ["OAuth2 with every field empty", { authType: "oauth2", ...empty }, CLIENT_ID],
        [
            "OAuth2 without the Basic fields",
            { authType: "oauth2", username: "", password: "" },
            undefined,
        ],
    ])("names the first missing field for %s", (_, overrides, reason) => {
        expect(reasonOf(requestAuthOf(ENDPOINT, { ...complete, ...overrides }))).toBe(reason);
    });

    it.each<[string, string, string | undefined]>([
        ["an empty endpoint", "", ENDPOINT_REQUIRED],
        ["a blank endpoint", "   ", ENDPOINT_REQUIRED],
        ["a URL", ENDPOINT, undefined],
        ["an env reference", "${env:MIRAGON_ENGINE_URL}", undefined],
    ])("requires the REST endpoint for %s", (_, endpoint, reason) => {
        expect(reasonOf(requestAuthOf(endpoint, { ...complete, authType: "basic" }))).toBe(reason);
    });

    it("names a missing endpoint before a missing auth field", () => {
        expect(requestAuthOf("", { ...complete, authType: "basic", username: "" })).toEqual({
            reason: ENDPOINT_REQUIRED,
        });
    });

    it("carries the auth payload of a complete request", () => {
        expect(
            requestAuthOf(ENDPOINT, { ...complete, authType: "basic", username: " user " }),
        ).toEqual({ auth: { authType: "basic", username: "user", password: "pass" } });
    });
});
