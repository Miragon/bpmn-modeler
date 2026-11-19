import { describe, expect, it } from "vitest";

import {
    ElementXmlMergeEditor,
    ElementXmlMergeFinished,
    ElementXmlMergeRequest,
} from "../diff/port/ElementXmlMergeEditor";

/** One side of a merge as the editor shows it: its text under its label. */
interface ShownSide {
    readonly label: string;
    readonly text: string;
}

/** What an open merge shows beside its result. */
export interface ElementXmlMergeInputs {
    readonly base: string;
    readonly current: ShownSide;
    readonly incoming: ShownSide;
}

/** One {@link ElementXmlMergeEditor} adapter under the {@link describeElementXmlMergeEditorContract} scenarios. */
export interface ElementXmlMergeEditorContractFixture {
    readonly editor: ElementXmlMergeEditor;
    /** The result each open merge shows, by element. */
    shown(): Readonly<Record<string, string>>;
    /** The base and both sides the open merge of `elementId` shows, if it is open. */
    inputs(elementId: string): ElementXmlMergeInputs | undefined;
    /** The element of the merge in front, if any. */
    focused(): string | undefined;
    /** The user saves `text` into the result of the merge of `elementId`. */
    save(elementId: string, text: string): void;
    /** The user closes the merge of `elementId`, declining to save. */
    closeByUser(elementId: string): void;
}

const requestFor = (elementId: string, key = `merge:${elementId}`): ElementXmlMergeRequest => ({
    key,
    elementId,
    labels: { current: "main", incoming: "feature" },
    base: `<bpmn:task id="${elementId}" />\n`,
    current: `<bpmn:task id="${elementId}" name="main" />\n`,
    incoming: `<bpmn:task id="${elementId}" name="feature" />\n`,
    start: `<<<<<<< main\n<bpmn:task id="${elementId}" name="main" />\n=======\n<bpmn:task id="${elementId}" name="feature" />\n>>>>>>> feature\n`,
});

const PACK = requestFor("Task_Pack");
const CHECK = requestFor("Task_Check");

/**
 * What the core relies on of a host's element XML merge editor: the start
 * text is no answer, a save is, also of the unchanged text; a merge finishes
 * once, when it closes, with the last save of the user or none; a close from
 * the core finishes it without a text; a key opens once at a time.
 */
export function describeElementXmlMergeEditorContract(
    adapter: string,
    createFixture: (onFinished: ElementXmlMergeFinished) => ElementXmlMergeEditorContractFixture,
): void {
    describe(`${adapter} keeps the ElementXmlMergeEditor contract`, () => {
        const fixtureReportingFinishes = () => {
            const finished: { key: string; written: string | undefined }[] = [];
            const fixture = createFixture((key, written) => finished.push({ key, written }));
            return { ...fixture, finished };
        };

        it("opens a merge with its start text as the result", async () => {
            const { editor, shown, focused } = fixtureReportingFinishes();

            await editor.open(PACK);

            expect(shown()).toStrictEqual({ Task_Pack: PACK.start });
            expect(focused()).toBe("Task_Pack");
        });

        it("shows the base, and each side's text under its own label", async () => {
            const { editor, inputs } = fixtureReportingFinishes();

            await editor.open(PACK);

            expect(inputs("Task_Pack")).toStrictEqual({
                base: PACK.base,
                current: { label: "main", text: PACK.current },
                incoming: { label: "feature", text: PACK.incoming },
            });
        });

        it("finishes a merge closed without a save without a text", async () => {
            const { editor, closeByUser, shown, finished } = fixtureReportingFinishes();
            await editor.open(PACK);

            closeByUser("Task_Pack");

            expect(finished).toStrictEqual([{ key: PACK.key, written: undefined }]);
            expect(shown()).toStrictEqual({});
        });

        it("finishes a merge with the text the user saved last", async () => {
            const { editor, save, closeByUser, finished } = fixtureReportingFinishes();
            await editor.open(PACK);

            save("Task_Pack", "<first />\n");
            save("Task_Pack", "<second />\n");
            closeByUser("Task_Pack");

            expect(finished).toStrictEqual([{ key: PACK.key, written: "<second />\n" }]);
        });

        it("counts a save of the unchanged start text", async () => {
            const { editor, save, closeByUser, finished } = fixtureReportingFinishes();
            await editor.open(PACK);

            save("Task_Pack", PACK.start);
            closeByUser("Task_Pack");

            expect(finished).toStrictEqual([{ key: PACK.key, written: PACK.start }]);
        });

        it("finishes a merge the core closes without a text, also after a save", async () => {
            const { editor, save, shown, finished } = fixtureReportingFinishes();
            await editor.open(PACK);
            save("Task_Pack", "<saved />\n");

            await editor.close(PACK.key);

            expect(finished).toStrictEqual([{ key: PACK.key, written: undefined }]);
            expect(shown()).toStrictEqual({});
        });

        it("closes one merge and leaves another open", async () => {
            const { editor, shown, finished } = fixtureReportingFinishes();
            await editor.open(PACK);
            await editor.open(CHECK);

            await editor.close(PACK.key);

            expect(shown()).toStrictEqual({ Task_Check: CHECK.start });
            expect(finished).toStrictEqual([{ key: PACK.key, written: undefined }]);
        });

        it("finishes nothing when the core closes a key that is not open", async () => {
            const { editor, finished } = fixtureReportingFinishes();

            await editor.close(PACK.key);

            expect(finished).toStrictEqual([]);
        });

        it("brings an open merge to the front", async () => {
            const { editor, focused } = fixtureReportingFinishes();
            await editor.open(PACK);
            await editor.open(CHECK);

            await editor.focus(PACK.key);

            expect(focused()).toBe("Task_Pack");
        });

        it("refuses a second open of an open key and keeps the open merge", async () => {
            const { editor, shown } = fixtureReportingFinishes();
            await editor.open(PACK);

            await expect(editor.open({ ...PACK, start: "<other />\n" })).rejects.toThrow();

            expect(shown()).toStrictEqual({ Task_Pack: PACK.start });
        });

        it("opens a key again after its merge finished", async () => {
            const { editor, closeByUser, shown } = fixtureReportingFinishes();
            await editor.open(PACK);
            closeByUser("Task_Pack");

            await editor.open(PACK);

            expect(shown()).toStrictEqual({ Task_Pack: PACK.start });
        });
    });
}
