import { beforeEach, describe, expect, it } from "vitest";

import {
    Command,
    LanguageQuery,
    RequestFocusCommand,
    SyncDocumentCommand,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";

import { EditorSubscription, SettingChange } from "../editorSession/domain/EditorSession";
import { EditorHandle } from "../editorSession/port/EditorHandle";
import { isHiddenEditorError } from "../kernel/domain/errors";
import { normalizeLineEndings } from "../kernel/domain/lineEndings";
import { RawModelerSettings, SettingKey } from "../kernel/domain/modelerSettings";

/** The document a scenario opens: a file on disk. */
export interface EditorHandleContractDocument {
    readonly fileName: string;
    readonly content: string;
}

/** One {@link EditorHandle} adapter under the {@link describeEditorHandleContract} scenarios. */
export interface EditorHandleContractFixture {
    /** The editor of the scenario's document, built as its host builds one. */
    readonly handle: EditorHandle;
    /** The webview sends a message to the host. */
    sendFromWebview(message: Command): void;
    /** The messages that reached the webview, in order. */
    receivedByWebview(): readonly unknown[];
    /** The user focuses the editor's tab. */
    focus(): void;
    /** The user moves the focus to another tab. */
    blur(): void;
    /** Another editor or program changes the document. */
    editElsewhere(content: string): void;
    /** The user gives modeler settings these values. */
    changeSettings(values: RawModelerSettings): void;
    /** The user closes the editor's tab. */
    close(): void;
    /** The user switches away and the host hides the webview; absent where the host never hides one. */
    hideWebview?(): void;
}

interface HandleEvent {
    readonly event: string;
    subscribe(handle: EditorHandle, listener: () => void): EditorSubscription;
    happen(fixture: EditorHandleContractFixture): void;
}

const DOCUMENT: EditorHandleContractDocument = {
    fileName: "order.bpmn",
    content: '<definitions id="order">\n  <process id="ship"/>\n</definitions>\n',
};
const EDITED = '<definitions id="order">\n  <process id="pay"/>\n</definitions>\n';

const HANDLE_EVENTS: readonly HandleEvent[] = [
    {
        event: "a webview message",
        subscribe: (handle, listener) => handle.onDidReceiveMessage(listener),
        happen: (fixture) => fixture.sendFromWebview(new RequestFocusCommand()),
    },
    {
        event: "a focus change",
        subscribe: (handle, listener) => handle.onDidChangeActive(listener),
        happen: (fixture) => {
            fixture.focus();
            fixture.blur();
        },
    },
    {
        event: "a document change",
        subscribe: (handle, listener) => handle.onDidChangeDocument(listener),
        happen: (fixture) => fixture.editElsewhere(EDITED),
    },
    {
        event: "a settings change",
        subscribe: (handle, listener) => handle.onDidChangeSetting(listener),
        happen: (fixture) => fixture.changeSettings({ language: "de" }),
    },
    {
        event: "the user closing the editor",
        subscribe: (handle, listener) => handle.onDidDispose(listener),
        happen: (fixture) => fixture.close(),
    },
    {
        event: "the core disposing the editor",
        subscribe: (handle, listener) => handle.onDidDispose(listener),
        happen: (fixture) => fixture.handle.dispose(),
    },
];

/**
 * The rules of {@link EditorHandle} the core relies on, run against one
 * adapter: what `EditorSessionStore`, `EditorSessionLifecycle`, the document
 * sync and the session participants read back from a handle. Where the hosts
 * differ, VS Code is the reference.
 *
 * Left out, because the hosts differ and the core relies on neither:
 * - Whether an edit of another document reaches a listener: VS Code's event is
 *   global, the bridge's is per document; the participants filter by
 *   `documentUriString()`.
 * - The focus before the first change, and whether a repeated focus fires
 *   again: VS Code opens a panel active, the bridge opens one inactive and its
 *   register handler activates it.
 * - The path of a document on a Windows drive or share: the host that builds
 *   the identity spells it (VS Code's `canonicalPath`, IntelliJ's file path),
 *   and the bridge and the fake take it as given.
 * - The expected document revision of a write, a refused write or save, and a
 *   read-only document: the core checks the revision before the handle, only a
 *   host refuses, and core specs spy on the fake's `save` for a refusal.
 * - `reload`: optional, and the bridge cannot restart its webview.
 */
export function describeEditorHandleContract(
    adapter: string,
    createFixture: (document: EditorHandleContractDocument) => EditorHandleContractFixture,
): void {
    describe(`${adapter} keeps the EditorHandle contract`, () => {
        let fixture: EditorHandleContractFixture;

        beforeEach(() => {
            fixture = createFixture(DOCUMENT);
        });

        describe("identity", () => {
            // `/c:/…` on VS Code and `C:/…` on IntelliJ are both absolute.
            it("names the session by its document's URI, and a file on disk by an absolute, /-separated path", () => {
                const { handle } = fixture;
                const path = handle.documentPath();

                expect({
                    id: handle.id,
                    scheme: handle.documentScheme(),
                    uriScheme: handle.documentUriString().split(":")[0],
                    absolutePath: /^(\/|[A-Za-z]:\/)/.test(path),
                    backslashInPath: path.includes("\\"),
                    pathFile: path.split("/").pop(),
                    fsPathFile: handle.documentFsPath().split(/[\\/]/).pop(),
                }).toEqual({
                    id: handle.documentUriString(),
                    scheme: "file",
                    uriScheme: "file",
                    absolutePath: true,
                    backslashInPath: false,
                    pathFile: DOCUMENT.fileName,
                    fsPathFile: DOCUMENT.fileName,
                });
            });
        });

        describe("subscriptions", () => {
            it.each(HANDLE_EVENTS)(
                "reports $event to every live subscription and never to a disposed one",
                ({ subscribe, happen }) => {
                    const heard = { first: false, disposed: false, last: false };
                    subscribe(fixture.handle, () => (heard.first = true));
                    const disposed = subscribe(fixture.handle, () => (heard.disposed = true));
                    subscribe(fixture.handle, () => (heard.last = true));

                    disposed.dispose();
                    happen(fixture);

                    expect(heard).toEqual({ first: true, disposed: false, last: true });
                },
            );
        });

        describe("webview messages", () => {
            it("hands every subscription the webview's messages in the order it sent them", () => {
                const messages = [new SyncDocumentCommand(EDITED, 1), new RequestFocusCommand()];
                const first: Command[] = [];
                const second: Command[] = [];
                fixture.handle.onDidReceiveMessage((message) => first.push(message));
                fixture.handle.onDidReceiveMessage((message) => second.push(message));

                messages.forEach((message) => fixture.sendFromWebview(message));

                expect({ first, second }).toEqual({ first: messages, second: messages });
            });

            it("delivers each post to the webview in order and resolves true", async () => {
                const queries = [new LanguageQuery("de"), new TakeFocusQuery()];

                for (const query of queries) {
                    await expect(fixture.handle.postMessage(query)).resolves.toBe(true);
                }

                expect(fixture.receivedByWebview()).toEqual(queries);
            });

            it("rejects a post to a hidden webview with the hidden-editor error", async ({
                skip,
            }) => {
                const hideWebview = fixture.hideWebview?.bind(fixture);
                if (!hideWebview) return skip("the host never hides its webview");
                hideWebview();

                const error = await fixture.handle.postMessage(new LanguageQuery("de")).then(
                    () => undefined,
                    (reason: unknown) => reason,
                );

                expect(isHiddenEditorError(error)).toBe(true);
                expect(fixture.receivedByWebview()).toEqual([]);
            });
        });

        describe("focus", () => {
            it("reports each focus change with the state isActive() reads in it", () => {
                const { handle } = fixture;
                const reported: { active: boolean; isActive: boolean }[] = [];
                handle.onDidChangeActive((active) =>
                    reported.push({ active, isActive: handle.isActive() }),
                );
                fixture.focus();
                const before = reported.length;

                fixture.blur();
                fixture.focus();

                expect(reported.slice(before)).toEqual([
                    { active: false, isActive: false },
                    { active: true, isActive: true },
                ]);
            });
        });

        describe("document", () => {
            /** What each change names, and the content the handle reads while it is reported. */
            function recordChanges(): Record<string, unknown>[] {
                const changes: Record<string, unknown>[] = [];
                fixture.handle.onDidChangeDocument((event) =>
                    changes.push({
                        documentUriString: event.documentUriString(),
                        documentPath: event.documentPath(),
                        hasContentChanges: event.hasContentChanges(),
                        content: fixture.handle.getContent(),
                    }),
                );
                return changes;
            }

            function changeOfThisDocument(content: string): Record<string, unknown> {
                return {
                    documentUriString: fixture.handle.documentUriString(),
                    documentPath: fixture.handle.documentPath(),
                    hasContentChanges: true,
                    content,
                };
            }

            it("reads the document's content", () => {
                expect(fixture.handle.getContent()).toBe(DOCUMENT.content);
            });

            it.each([
                { lineEndings: "LF", content: EDITED },
                { lineEndings: "CRLF", content: EDITED.replace(/\n/g, "\r\n") },
            ])(
                "applies a write with $lineEndings line endings and reads it back",
                async ({ content }) => {
                    await expect(fixture.handle.writeContent(content)).resolves.toBe(true);

                    expect(normalizeLineEndings(fixture.handle.getContent())).toBe(
                        normalizeLineEndings(content),
                    );
                },
            );

            // The document sync takes a change that reads the content it is writing for its own echo.
            it("reports its own write as a change of this document before the write resolves", async () => {
                const changes = recordChanges();

                const reportedBeforeResolving = await fixture.handle
                    .writeContent(EDITED)
                    .then(() => [...changes]);

                expect(reportedBeforeResolving).toEqual([changeOfThisDocument(EDITED)]);
            });

            it("answers a write of the content it holds with false and no change", async () => {
                const changes = recordChanges();

                await expect(fixture.handle.writeContent(DOCUMENT.content)).resolves.toBe(false);

                expect(changes).toEqual([]);
                expect(fixture.handle.getContent()).toBe(DOCUMENT.content);
            });

            it("reports an edit made elsewhere as a change of this document that reads the new content", () => {
                const changes = recordChanges();

                fixture.editElsewhere(EDITED);

                expect(changes).toEqual([changeOfThisDocument(EDITED)]);
            });

            it.each([
                {
                    state: "after an edit",
                    prepare: async (handle: EditorHandle) => {
                        await handle.writeContent(EDITED);
                    },
                },
                { state: "with nothing to save", prepare: async () => undefined },
            ])("reports a save $state as saved", async ({ prepare }) => {
                await prepare(fixture.handle);

                await expect(fixture.handle.save()).resolves.toBe(true);
            });
        });

        describe("settings", () => {
            it("names the settings that changed and no other", () => {
                const changes: SettingChange[] = [];
                fixture.handle.onDidChangeSetting((change) => changes.push(change));

                fixture.changeSettings({ language: "de", lintingEnabled: false });

                const affected = (key: SettingKey) => changes.some((change) => change.affects(key));
                expect({
                    language: affected("language"),
                    lintingEnabled: affected("linting.enabled"),
                    configFolder: affected("configFolder"),
                }).toEqual({ language: true, lintingEnabled: true, configFolder: false });
            });
        });

        describe("closing", () => {
            it("runs each dispose listener and releases each added subscription once, disposed twice", () => {
                const { handle } = fixture;
                const counts = { listened: 0, released: 0 };
                handle.onDidDispose(() => counts.listened++);
                handle.addSubscription({ dispose: () => counts.released++ });

                handle.dispose();
                handle.dispose();

                expect(counts).toEqual({ listened: 1, released: 1 });
            });

            // The store disposes the handle from its own dispose listener.
            it("runs each dispose listener once when the user closes the editor and a listener disposes it", () => {
                const { handle } = fixture;
                const counts = { listened: 0, released: 0 };
                handle.onDidDispose(() => {
                    counts.listened++;
                    handle.dispose();
                });
                handle.addSubscription({ dispose: () => counts.released++ });

                fixture.close();
                handle.dispose();

                expect(counts).toEqual({ listened: 1, released: 1 });
            });

            it("hands no webview message to a subscription added to a disposed handle", () => {
                const { handle } = fixture;
                const received: Command[] = [];
                handle.addSubscription(
                    handle.onDidReceiveMessage((message) => received.push(message)),
                );

                handle.dispose();
                fixture.sendFromWebview(new RequestFocusCommand());

                expect(received).toEqual([]);
            });
        });
    });
}
