import { beforeEach, describe, expect, it } from "vitest";

import { ClipboardPort } from "../kernel/port/hostPorts";

/**
 * One {@link ClipboardPort} adapter under the {@link describeClipboardContract}
 * scenarios, on a system clipboard that holds no text yet.
 */
export interface ClipboardContractFixture {
    readonly clipboard: ClipboardPort;
    /** Puts text on the system clipboard as another program would, once the adapter's earlier writes have landed. */
    copyElsewhere(text: string): Promise<void>;
    /** The text another program would paste, once the adapter's earlier writes have landed. */
    pasteElsewhere(): Promise<string>;
}

const COPIED_ELEMENTS = JSON.stringify({
    tree: {
        0: [{ id: "Task_check", type: "bpmn:UserTask", name: 'Check "order"' }],
        1: [{ id: "Doc_1", text: "Line one\nLine two \\ escaped" }],
    },
});

/**
 * The rules of {@link ClipboardPort} the core relies on, run against one
 * adapter. The sandboxed webview cannot reach the clipboard, so the core
 * writes a copy through the port and reads it back on paste: the text comes
 * back exactly as written, the latest write wins, and the port reads and
 * writes the system clipboard, so a copy in another program pastes in the
 * modeler and the reverse. A clipboard without text reads as empty text,
 * which the core hands the webview as nothing to paste.
 *
 * Left out:
 * - A read or write that fails: the core logs it and answers empty text,
 *   so whether an adapter throws or answers empty text is not pinned.
 * - When a write lands: the bridge sends it without awaiting the host, so its
 *   promise resolves before the host writes. The core never waits for a copy,
 *   and every host handles a later read after the write.
 * - Non-text content and line-ending conversion: the host's clipboard decides
 *   (VS Code's `readText`, IntelliJ's string flavour), not the adapter.
 */
export function describeClipboardContract(
    adapter: string,
    createFixture: () => Promise<ClipboardContractFixture>,
): void {
    describe(`${adapter} keeps the ClipboardPort contract`, () => {
        let fixture: ClipboardContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it("reads a clipboard without text as empty text", async () => {
            await expect(fixture.clipboard.readClipboard()).resolves.toBe("");
        });

        it.each([
            { behaviour: "copied diagram elements", text: COPIED_ELEMENTS },
            { behaviour: "text across lines", text: "first line\nsecond line\n" },
            { behaviour: "text beyond ASCII", text: "Prüfung abschließen ✓ 🚀" },
            { behaviour: "text with surrounding whitespace", text: "  ${amount}\t " },
        ])("reads back $behaviour exactly as written", async ({ text }) => {
            await fixture.clipboard.writeClipboard(text);

            await expect(fixture.clipboard.readClipboard()).resolves.toBe(text);
        });

        it("reads the latest of two copies", async () => {
            await fixture.clipboard.writeClipboard("first copy");
            await fixture.clipboard.writeClipboard("second copy");

            await expect(fixture.clipboard.readClipboard()).resolves.toBe("second copy");
        });

        it("reads what another program copied after the modeler's own copy", async () => {
            await fixture.clipboard.writeClipboard("modeler copy");
            await fixture.copyElsewhere("copied elsewhere");

            await expect(fixture.clipboard.readClipboard()).resolves.toBe("copied elsewhere");
        });

        it("hands the modeler's copy to other programs", async () => {
            await fixture.clipboard.writeClipboard("modeler copy");

            await expect(fixture.pasteElsewhere()).resolves.toBe("modeler copy");
        });
    });
}
