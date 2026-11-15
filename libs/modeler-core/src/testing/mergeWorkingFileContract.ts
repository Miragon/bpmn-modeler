import { describe, expect, it } from "vitest";

import { MergeWorkingFile } from "../diff/port/MergeWorkingFile";

/** One {@link MergeWorkingFile} adapter over files it can seed and edit. */
export interface MergeWorkingFileContractFixture {
    readonly workingFile: MergeWorkingFile;
    /** Writes `text` to a new file on disk that no editor holds; returns its URI. */
    onDisk(text: string): Promise<string>;
    /** Opens the file in an editor and changes its text to `text` without saving. */
    editUnsaved(fileUri: string, text: string): Promise<void>;
    /** The file's text on disk. */
    diskText(fileUri: string): Promise<string>;
}

const MARKED = "<<<<<<< HEAD\n<current/>\n=======\n<incoming/>\n>>>>>>> feature\n";
const BUILT = "<definitions/>\n";

/**
 * What the core relies on of the working file: a read sees the user's
 * unsaved edits and says so, since a build that saves over them would lose
 * them; a replace saves, so the file on disk, every open editor and the next
 * read agree and nothing is left dirty.
 */
export function describeMergeWorkingFileContract(
    adapter: string,
    createFixture: () => MergeWorkingFileContractFixture | Promise<MergeWorkingFileContractFixture>,
): void {
    describe(`${adapter} keeps the MergeWorkingFile contract`, () => {
        it("reads a file no editor holds from disk, with no unsaved changes", async () => {
            const fixture = await createFixture();
            const fileUri = await fixture.onDisk(MARKED);

            await expect(fixture.workingFile.read(fileUri)).resolves.toStrictEqual({
                text: MARKED,
                isDirty: false,
            });
        });

        it("reads the unsaved edits of an open editor and says they are unsaved", async () => {
            const fixture = await createFixture();
            const fileUri = await fixture.onDisk(MARKED);

            await fixture.editUnsaved(fileUri, "<edited/>\n");

            await expect(fixture.workingFile.read(fileUri)).resolves.toStrictEqual({
                text: "<edited/>\n",
                isDirty: true,
            });
            await expect(fixture.diskText(fileUri)).resolves.toBe(MARKED);
        });

        it("replaces the file and saves it, so a read after it returns the text, clean", async () => {
            const fixture = await createFixture();
            const fileUri = await fixture.onDisk(MARKED);

            await fixture.workingFile.replace(fileUri, BUILT);

            await expect(fixture.workingFile.read(fileUri)).resolves.toStrictEqual({
                text: BUILT,
                isDirty: false,
            });
            await expect(fixture.diskText(fileUri)).resolves.toBe(BUILT);
        });

        it("replaces a file with CRLF line endings in its own line endings, as an editor keeps them", async () => {
            const fixture = await createFixture();
            const fileUri = await fixture.onDisk(MARKED.replaceAll("\n", "\r\n"));

            await fixture.workingFile.replace(fileUri, "<definitions>\n<process/>\n</definitions>\n");

            const crlfBuilt = "<definitions>\r\n<process/>\r\n</definitions>\r\n";
            await expect(fixture.workingFile.read(fileUri)).resolves.toStrictEqual({
                text: crlfBuilt,
                isDirty: false,
            });
            await expect(fixture.diskText(fileUri)).resolves.toBe(crlfBuilt);
        });

        it("replaces unsaved edits and saves, leaving nothing unsaved", async () => {
            const fixture = await createFixture();
            const fileUri = await fixture.onDisk(MARKED);
            await fixture.editUnsaved(fileUri, "<edited/>\n");

            await fixture.workingFile.replace(fileUri, BUILT);

            await expect(fixture.workingFile.read(fileUri)).resolves.toStrictEqual({
                text: BUILT,
                isDirty: false,
            });
            await expect(fixture.diskText(fileUri)).resolves.toBe(BUILT);
        });
    });
}
