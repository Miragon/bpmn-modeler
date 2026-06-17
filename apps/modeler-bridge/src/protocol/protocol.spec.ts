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

import { METHODS, PROTOCOL, protocolSnapshot, protocolTable } from "./descriptor";

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
                    "",
                    "Core → Host (requests):",
                    "  document/write",
                    "  document/save",
                    "  picker/show",
                    "  clipboard/read",
                    "  secretStore/saveBasicAuth",
                    "  secretStore/getBasicAuth",
                    "  secretStore/saveOAuth2",
                    "  secretStore/getOAuth2",
                    "",
                    "Core → Host (notifications):",
                    "  editor/postMessage",
                    "  clipboard/write",
                    "  notifier/showInfo",
                    "  notifier/showError",
                    "  notifier/notifyError",
                    "  notifier/openConsole",
                    "  notifier/openDocument",
                    "  notifier/log",
                    "  notifier/progressStart",
                    "  notifier/progressEnd",
                    "  statusBar/templatesLoading",
                    "  statusBar/templatesReady",
                    "  statusBar/templatesHide",
                    "  statusBar/showEngineVersion",
                    "  statusBar/hideEngineVersion",
                    "  statusBar/disposeEngineVersion",
                    "  diff/postMessage",
                    "  deploymentState/saveAuthType",
                    "  deploymentState/saveOAuth2Config",
                    "  deploymentState/save",
                    "  deployment/postMessage",
                    "  script/open",
                    "  script/updateVariables",
                    "  script/close",
                ].join("\n"),
            );
        });
    });
});
