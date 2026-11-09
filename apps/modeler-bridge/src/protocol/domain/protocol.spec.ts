/**
 * The host↔core RPC contract test. It pins the surface the rest of the bridge
 * (and, via `protocol.json`, the IntelliJ Kotlin host) relies on, so any
 * accidental drift — a renamed method, a flipped direction, a changed param key
 * set — fails CI here rather than at runtime on a different host.
 *
 * The compile-time half (each fixture `satisfies` its named param/result type)
 * lives in `descriptor.ts` and is enforced by `tsc`; this file covers the
 * runtime half: internal consistency, JSON round-trippability, snapshot
 * equality, and the rendered doc table.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
    HOST_SHOW_REPLY_DEADLINE_MS,
    HOST_WORK_REPLY_DEADLINE_MS,
    METHODS,
    PROTOCOL,
    protocolSnapshot,
    protocolTable,
    replyDeadlineMs,
} from "./descriptor";

// `PROTOCOL` is `as const`, so the compiler already proves a request is never
// Host→Core (its direction narrows to the literal `"coreToHost"`). Widen the
// view here so the *runtime* assertion below stays a genuine, executable check
// instead of a comparison the type-checker rejects as having no overlap.
const ENTRIES: ReadonlyArray<{ method: string; direction: string; kind: string }> = PROTOCOL;

describe("RPC protocol descriptor", () => {
    describe("internal consistency", () => {
        it("has a unique method name per entry", () => {
            const methods = PROTOCOL.map((entry) => entry.method);
            expect(new Set(methods).size).toBe(methods.length);
        });

        it("keeps METHODS and PROTOCOL method sets identical", () => {
            const fromConstants = new Set<string>(Object.values(METHODS));
            const fromDescriptor = new Set<string>(PROTOCOL.map((entry) => entry.method));
            expect(fromConstants).toEqual(fromDescriptor);
        });

        it("uses only valid directions and kinds", () => {
            for (const entry of PROTOCOL) {
                expect(["hostToCore", "coreToHost"]).toContain(entry.direction);
                expect(["notification", "request"]).toContain(entry.kind);
            }
        });

        it("never declares a Host→Core request (requests are always Core→Host)", () => {
            const hostRequests = ENTRIES.filter(
                (entry) => entry.kind === "request" && entry.direction === "hostToCore",
            );
            expect(hostRequests).toEqual([]);
        });

        it("attaches a result fixture only to requests", () => {
            for (const entry of PROTOCOL) {
                if ("resultFixture" in entry) {
                    expect(entry.kind).toBe("request");
                }
            }
        });
    });

    describe("fixtures", () => {
        it("are JSON-round-trippable plain objects", () => {
            for (const entry of PROTOCOL) {
                expect(JSON.parse(JSON.stringify(entry.paramsFixture))).toEqual(
                    entry.paramsFixture,
                );
                if ("resultFixture" in entry && entry.resultFixture) {
                    expect(JSON.parse(JSON.stringify(entry.resultFixture))).toEqual(
                        entry.resultFixture,
                    );
                }
            }
        });
    });

    describe("snapshot", () => {
        it("deep-equals the checked-in protocol.json", () => {
            const committed = JSON.parse(readFileSync(resolve(__dirname, "protocol.json"), "utf8"));
            expect(protocolSnapshot()).toEqual(committed);
        });
    });

    describe("doc table", () => {
        it("lists every method exactly once", () => {
            const lines = protocolTable().split("\n");
            for (const entry of PROTOCOL) {
                const occurrences = lines.filter((line) => line === `  ${entry.method}`).length;
                expect(occurrences, `method listed once: ${entry.method}`).toBe(1);
            }
        });

        it("renders the canonical grouped table", () => {
            expect(protocolTable()).toBe(
                [
                    "Host → Core (notifications):",
                    "  session/register",
                    "  webview/message",
                    "  document/didChange",
                    "  session/setActive",
                    "  session/dispose",
                    "  settings/didChange",
                    "  diff/open",
                    "  diff/webviewMessage",
                    "  diff/dispose",
                    "  deploymentState/seed",
                    "  deployment/webviewMessage",
                    "  deployment/open",
                    "  script/didChange",
                    "  script/didClose",
                    "  script/openAll",
                    "  script/didOpenExternal",
                    "  marketplace/add",
                    "  marketplace/update",
                    "  marketplace/remove",
                    "  modeler/changeEngineVersion",
                    "  linting/toggle",
                    "  migration/migrateAll",
                    "  layout/format",
                    "  layout/cleanup",
                    "  deployment/switchTarget",
                    "  deployment/deployFiles",
                    "  deployment/deployActive",
                    "  deployment/verify",
                    "  deployment/statusBarMenu",
                    "  pluginApprovals/didChange",
                    "  templatePreferences/didChange",
                    "  addOns/webviewMessage",
                    "  addOns/open",
                    "  addOns/refresh",
                    "",
                    "Core → Host (requests):",
                    "  document/write",
                    "  document/save",
                    "  picker/show",
                    "  confirm/show",
                    "  clipboard/read",
                    "  secretStore/saveBasicAuth",
                    "  secretStore/getBasicAuth",
                    "  secretStore/saveOAuth2",
                    "  secretStore/getOAuth2",
                    "  secretStore/getApprovedDestinations",
                    "  secretStore/saveApprovedDestinations",
                    "  secretStore/delete",
                    "  deploymentState/save",
                    "  marketplaceState/read",
                    "  marketplaceState/save",
                    "  marketplaceState/remove",
                    "  marketplacePrompt/show",
                    "  tokenStore/get",
                    "  tokenStore/set",
                    "  tokenPrompt/show",
                    "  settings/setLintingEnabled",
                    "  actionNotice/show",
                    "  pluginApprovals/change",
                    "  pluginApprovals/read",
                    "  templatePreferences/change",
                    "  templatePreferences/read",
                    "  addOns/reveal",
                    "",
                    "Core → Host (notifications):",
                    "  editor/postMessage",
                    "  editor/reload",
                    "  clipboard/write",
                    "  notifier/showInfo",
                    "  notifier/showWarning",
                    "  notifier/showError",
                    "  notifier/openConsole",
                    "  notifier/openDocument",
                    "  notifier/log",
                    "  notifier/progressStart",
                    "  notifier/progressEnd",
                    "  statusBar/update",
                    "  diff/postMessage",
                    "  deployment/postMessage",
                    "  script/open",
                    "  script/updateVariables",
                    "  script/updateContent",
                    "  script/close",
                    "  addOns/postMessage",
                ].join("\n"),
            );
        });
    });

    describe("reply deadlines", () => {
        it.each([
            METHODS.pickerShow,
            METHODS.confirmShow,
            METHODS.tokenPromptShow,
            METHODS.marketplacePromptShow,
            METHODS.actionNoticeShow,
        ])("waits for the user to answer %s", (method) => {
            expect(replyDeadlineMs(method)).toBeUndefined();
        });

        it.each([
            { method: METHODS.documentWrite, state: "the document mirror" },
            { method: METHODS.deploymentStateSave, state: "the deployment-state mirror" },
            { method: METHODS.marketplaceStateSave, state: "the fetched marketplace cache" },
            { method: METHODS.marketplaceStateRemove, state: "the marketplace cache prune" },
            { method: METHODS.pluginApprovalsChange, state: "the plugin-approval mirror" },
            { method: METHODS.templatePreferencesChange, state: "the template-switch mirror" },
        ])(
            "waits for the reply to $method, so $state stays in step with the host",
            ({ method }) => {
                expect(replyDeadlineMs(method)).toBeUndefined();
            },
        );

        it.each([
            METHODS.documentSave,
            METHODS.clipboardRead,
            METHODS.secretStoreSaveBasicAuth,
            METHODS.secretStoreGetBasicAuth,
            METHODS.secretStoreSaveOAuth2,
            METHODS.secretStoreGetOAuth2,
            METHODS.secretStoreGetApprovedDestinations,
            METHODS.secretStoreSaveApprovedDestinations,
            METHODS.secretStoreDelete,
            METHODS.tokenStoreGet,
            METHODS.tokenStoreSet,
            METHODS.settingsSetLintingEnabled,
            METHODS.marketplaceStateRead,
            METHODS.pluginApprovalsRead,
            METHODS.templatePreferencesRead,
        ])("gives up on %s after the host-work deadline", (method) => {
            expect(replyDeadlineMs(method)).toBe(HOST_WORK_REPLY_DEADLINE_MS);
        });

        it.each([METHODS.addOnsReveal])(
            "gives up on %s after the show deadline, so the caller falls back soon",
            (method) => {
                expect(replyDeadlineMs(method)).toBe(HOST_SHOW_REPLY_DEADLINE_MS);
                expect(HOST_SHOW_REPLY_DEADLINE_MS).toBeLessThan(HOST_WORK_REPLY_DEADLINE_MS);
            },
        );
    });
});
