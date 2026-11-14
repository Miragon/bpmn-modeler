import { describe, expect, it, vi } from "vitest";

import type { DiffSide } from "@miragon/bpmn-modeler-types";
import {
    BpmnFileQuery,
    LanguageQuery,
    SyncCursorQuery,
    SyncViewportQuery,
} from "@miragon/bpmn-modeler-shared";

import { DiffPaneHandle } from "../diff/port/DiffPaneHandle";

/** One side of the diff a fixture opens: the URI the host keys its pane by, and its text. */
export interface DiffPaneSide {
    readonly uri: string;
    readonly text: string;
}

/** Both panes of one diff, opened by one {@link DiffPaneHandle} adapter. */
export interface DiffPaneContractFixture {
    readonly before: DiffPaneHandle;
    readonly after: DiffPaneHandle;
    /** The messages the side's webview received so far, in the order they arrived. */
    receivedBy(side: DiffSide): readonly unknown[];
}

const BEFORE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

const AFTER_XML = BEFORE_XML.replace(
    '<bpmn:startEvent id="StartEvent_1" />',
    '<bpmn:startEvent id="StartEvent_1" />\n    <bpmn:task id="Task_1" />',
);

const WORKING_TREE = "file:///repo/order.bpmn";
const REVISION = "git:/repo/order.bpmn?ref=HEAD";

/**
 * The rules of {@link DiffPaneHandle} the diff core relies on, run against one
 * adapter. `DiffPaneStore` and `DiffSession` find a pane by its `uri`;
 * `BpmnDiffService` answers the webview's file request from `getText` before the
 * pane reports ready, readies a pane only on its `DiffReadyCommand`, runs the
 * differ on `getText` once both panes are ready, posts the locale only to ready
 * panes, and forwards viewport and cursor to the partner; a host detaches a pane
 * from its session as the pane is disposed.
 *
 * The element XML diff names both panes' revisions in its title.
 *
 * Left out, because the hosts differ and the core relies on none of it:
 * - Which revision a pane reports. VS Code reads it from the URI of the Git
 *   extension's document, the bridge cannot tell and reports it as unknown.
 * - What `postMessage` resolves to. VS Code answers whether the webview took the
 *   message, the bridge always `true`; the core awaits it only for a rejection.
 * - Whether a post has arrived once `postMessage` resolves. The bridge resolves
 *   when its notification is written, before IntelliJ hands it to the page; the
 *   core never waits for delivery, and the suite waits for each post.
 * - The text once the host's document changes while the pane is open. VS Code
 *   reads the live document, the bridge the text IntelliJ sent at `diff/open`.
 * - What `dispose` does on the host, and what a disposed pane reads and posts.
 *   VS Code closes the panel, and its disposed panel refuses a post; the bridge
 *   drops its copy of the text and reads not ready, because IntelliJ already
 *   closed the pane and drops a post to it. The core reads neither.
 */
export function describeDiffPaneContract(
    adapter: string,
    openDiff: (sides: Readonly<Record<DiffSide, DiffPaneSide>>) => DiffPaneContractFixture,
): void {
    describe(`${adapter} keeps the DiffPaneHandle contract`, () => {
        const openScmDiff = () =>
            openDiff({
                before: { uri: REVISION, text: BEFORE_XML },
                after: { uri: WORKING_TREE, text: AFTER_XML },
            });

        // Delivery may be synchronous, as in VS Code, or deferred, as in the bridge.
        const eventually = (assertion: () => void) =>
            vi.waitFor(assertion, { timeout: 2000, interval: 10 });

        const diffs = [
            {
                diff: "a Git revision against the working tree, as VS Code opens an SCM diff",
                before: REVISION,
                after: WORKING_TREE,
            },
            {
                diff: "two files, as Compare Files opens them",
                before: "file:///repo/order.bpmn",
                after: "file:///repo/order-v2.bpmn",
            },
            {
                diff: "both sides of one file, told apart by a fragment as IntelliJ scopes them",
                before: "file:///repo/order.bpmn#diff-1-before",
                after: "file:///repo/order.bpmn#diff-1-after",
            },
        ];

        it.each(diffs)(
            "keeps the URI each pane was opened for, also once disposed: $diff",
            ({ before, after }) => {
                const fixture = openDiff({
                    before: { uri: before, text: BEFORE_XML },
                    after: { uri: after, text: AFTER_XML },
                });

                expect([fixture.before.uri, fixture.after.uri]).toEqual([before, after]);

                // A host finds the session of a disposed pane by its URI to detach it.
                fixture.before.dispose();
                fixture.after.dispose();

                expect([fixture.before.uri, fixture.after.uri]).toEqual([before, after]);
            },
        );

        it("keeps the revision it reports, once ready and once disposed", () => {
            const { before, after } = openScmDiff();
            const opened = [before.revision, after.revision];

            before.setReady();
            after.setReady();
            const ready = [before.revision, after.revision];
            before.dispose();
            after.dispose();

            expect([ready, [before.revision, after.revision]]).toStrictEqual([opened, opened]);
        });

        it("becomes ready only by its own setReady, not by serving its file", async () => {
            const fixture = openScmDiff();
            const { before, after } = fixture;

            expect([before.isReady(), after.isReady()]).toEqual([false, false]);

            // The core answers a pane's file request before the pane reports ready.
            const beforeFile = new BpmnFileQuery(before.getText(), undefined, "viewer");
            const afterFile = new BpmnFileQuery(after.getText(), undefined, "viewer");
            await before.postMessage(beforeFile);
            await after.postMessage(afterFile);
            await eventually(() => {
                expect(fixture.receivedBy("before")).toEqual([beforeFile]);
                expect(fixture.receivedBy("after")).toEqual([afterFile]);
            });

            expect([before.isReady(), after.isReady()]).toEqual([false, false]);

            before.setReady();
            before.setReady();

            expect([before.isReady(), after.isReady()]).toEqual([true, false]);
        });

        it.each([
            { diff: "two diagrams", beforeText: BEFORE_XML, afterText: AFTER_XML },
            {
                diff: "a file added since the revision, whose revision side is empty",
                beforeText: "",
                afterText: AFTER_XML,
            },
        ])(
            "reads each side's own text, before and after it is ready: $diff",
            ({ beforeText, afterText }) => {
                const { before, after } = openDiff({
                    before: { uri: REVISION, text: beforeText },
                    after: { uri: WORKING_TREE, text: afterText },
                });

                expect([before.getText(), after.getText()]).toEqual([beforeText, afterText]);

                before.setReady();
                after.setReady();

                expect([before.getText(), after.getText()]).toEqual([beforeText, afterText]);
            },
        );

        it.each(diffs)(
            "delivers each post to its own pane's webview in order, before it is ready too: $diff",
            async ({ before: beforeUri, after: afterUri }) => {
                const fixture = openDiff({
                    before: { uri: beforeUri, text: BEFORE_XML },
                    after: { uri: afterUri, text: AFTER_XML },
                });
                const { before, after } = fixture;
                const file = new BpmnFileQuery(BEFORE_XML, undefined, "viewer");
                const language = new LanguageQuery("de");
                const cursor = new SyncCursorQuery(2);
                const viewport = new SyncViewportQuery({ x: 1, y: 2, width: 3, height: 4 });

                await before.postMessage(file);
                before.setReady();
                await before.postMessage(language);
                await before.postMessage(cursor);
                await after.postMessage(viewport);

                await eventually(() => {
                    expect(fixture.receivedBy("before")).toEqual([file, language, cursor]);
                    expect(fixture.receivedBy("after")).toEqual([viewport]);
                });
            },
        );

        it("leaves the other pane open when one is disposed", async () => {
            const fixture = openScmDiff();
            const { before, after } = fixture;
            before.setReady();
            after.setReady();
            const language = new LanguageQuery("de");

            before.dispose();
            await after.postMessage(language);

            expect(after.isReady()).toBe(true);
            expect(after.getText()).toBe(AFTER_XML);
            await eventually(() => expect(fixture.receivedBy("after")).toEqual([language]));
        });
    });
}
