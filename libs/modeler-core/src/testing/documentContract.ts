import { beforeEach, describe, expect, it } from "vitest";

import { normalizeLineEndings } from "../kernel/domain/lineEndings";
import { DocumentPort } from "../kernel/port/hostPorts";

/** One {@link DocumentPort} adapter under the {@link describeDocumentContract} scenarios. */
export interface DocumentContractFixture {
    readonly documents: DocumentPort;
    /**
     * The user opens the file at `path`, absolute and `/`-separated, in an
     * editor whose document holds `content`; returns the editor's id.
     */
    open(path: string, content: string): string;
    /** Another editor or program changes the document, and the host reports the change to the core. */
    editElsewhere(editorId: string, content: string): void;
    /** The document revision the core holds for the editor: the one the host reported last. */
    revision(editorId: string): number;
    /** The text the host's document holds, read on the host's side. */
    hostContent(editorId: string): string;
    /** The host fails every later save of the document, as on a veto or a conflict with the file on disk. */
    failSaves(editorId: string): void;
}

interface OpenFile {
    readonly path: string;
    readonly content: string;
}

const ORDER: OpenFile = {
    path: "/work/order.bpmn",
    content: '<definitions id="order">\n  <process id="ship"/>\n</definitions>\n',
};
const INVOICE: OpenFile = {
    path: "/work/invoice.bpmn",
    content: '<definitions id="invoice">\n  <process id="bill"/>\n</definitions>\n',
};
const EDITED = '<definitions id="order">\n  <process id="pay"/>\n</definitions>\n';
const EDITED_AGAIN = '<definitions id="order">\n  <process id="refund"/>\n</definitions>\n';
const CHANGED_ELSEWHERE = '<definitions id="order">\n  <process id="return"/>\n</definitions>\n';

interface WriteBasis {
    readonly basis: string;
    prepare(fixture: DocumentContractFixture, editorId: string): void;
    revisionOf(fixture: DocumentContractFixture, editorId: string): number | undefined;
}

const APPLIED_WRITES: readonly WriteBasis[] = [
    {
        basis: "at the revision the core holds",
        prepare: () => undefined,
        revisionOf: (fixture, editorId) => fixture.revision(editorId),
    },
    {
        basis: "at the revision of the host's latest change",
        prepare: (fixture, editorId) => fixture.editElsewhere(editorId, CHANGED_ELSEWHERE),
        revisionOf: (fixture, editorId) => fixture.revision(editorId),
    },
    {
        basis: "that carries no revision",
        prepare: () => undefined,
        revisionOf: () => undefined,
    },
];

/**
 * The rules of {@link DocumentPort} the core relies on, run against one
 * adapter: what the document sync, the migration, the deployment and the
 * features that read the open file's path or text read back. Where the hosts
 * differ, VS Code is the reference.
 *
 * Left out, because the hosts differ and the core relies on neither:
 * - A write without a revision while a host change has not reached the
 *   webview: IntelliJ refuses it to keep an edit the page has not shown, VS
 *   Code applies it. The migration, the only caller without a revision, skips
 *   a refused write.
 * - A failed edit: VS Code answers `false`, IntelliJ answers the request with
 *   an error, so the write rejects. The migration skips the diagram either way.
 * - A write in flight when its editor closes or reopens: IntelliJ refuses it,
 *   VS Code applies it to the same `TextDocument`. The core checks the session
 *   again after every write (`DocumentSnapshot.isCurrent`).
 * - The text of an editor that is not open: the bridge reads an empty text,
 *   `EditorSessionDocuments` throws. The core reads only editors the store
 *   holds or catches the throw.
 * - The path of a file on a Windows drive or share: each host spells it as
 *   its file system does (VS Code `/c:/…`, IntelliJ `C:/…`).
 *
 * A save is judged by the host's answer, not by the file on disk, which the
 * host owns.
 */
export function describeDocumentContract(
    adapter: string,
    createFixture: () => DocumentContractFixture,
): void {
    describe(`${adapter} keeps the DocumentPort contract`, () => {
        let fixture: DocumentContractFixture;

        beforeEach(() => {
            fixture = createFixture();
        });

        const openOrderAndInvoice = () => ({
            order: fixture.open(ORDER.path, ORDER.content),
            invoice: fixture.open(INVOICE.path, INVOICE.content),
        });

        const read = (editorId: string) => ({
            content: fixture.documents.getContent(editorId),
            hostContent: fixture.hostContent(editorId),
        });

        describe("reading", () => {
            // A path without a scheme: the core takes posix.dirname and basename of it.
            it("reads each open editor's own text and the absolute, /-separated path of its file", () => {
                const { documents } = fixture;
                const { order, invoice } = openOrderAndInvoice();

                expect([order, invoice].map((editorId) => documents.getContent(editorId))).toEqual([
                    ORDER.content,
                    INVOICE.content,
                ]);
                expect([order, invoice].map((editorId) => documents.getFilePath(editorId))).toEqual(
                    [ORDER.path, INVOICE.path],
                );
            });

            it("reads a change the host reported for one editor at once and leaves the others", () => {
                const { order, invoice } = openOrderAndInvoice();

                fixture.editElsewhere(order, CHANGED_ELSEWHERE);

                expect({ order: read(order), invoice: read(invoice) }).toEqual({
                    order: { content: CHANGED_ELSEWHERE, hostContent: CHANGED_ELSEWHERE },
                    invoice: { content: INVOICE.content, hostContent: INVOICE.content },
                });
            });
        });

        describe("writing", () => {
            it.each(APPLIED_WRITES)(
                "applies a write $basis and reads it back once the write resolves",
                async ({ prepare, revisionOf }) => {
                    const order = fixture.open(ORDER.path, ORDER.content);
                    prepare(fixture, order);

                    await expect(
                        fixture.documents.write(order, EDITED, revisionOf(fixture, order)),
                    ).resolves.toBe(true);

                    expect(read(order)).toEqual({ content: EDITED, hostContent: EDITED });
                },
            );

            it("refuses a write based on a revision the host has since replaced, and keeps the host's change", async () => {
                const order = fixture.open(ORDER.path, ORDER.content);
                const staleRevision = fixture.revision(order);
                fixture.editElsewhere(order, CHANGED_ELSEWHERE);

                await expect(fixture.documents.write(order, EDITED, staleRevision)).resolves.toBe(
                    false,
                );

                expect(read(order)).toEqual({
                    content: CHANGED_ELSEWHERE,
                    hostContent: CHANGED_ELSEWHERE,
                });
            });

            // The document sync tells this apart from a refusal by reading the content.
            it("answers a write of the text the document holds with false and keeps it", async () => {
                const order = fixture.open(ORDER.path, ORDER.content);

                await expect(
                    fixture.documents.write(order, ORDER.content, fixture.revision(order)),
                ).resolves.toBe(false);

                expect(read(order)).toEqual({ content: ORDER.content, hostContent: ORDER.content });
            });

            // The webview sends each edit with the revision it rendered.
            it("keeps the revision across the core's own writes, so the next edit at that revision applies too", async () => {
                const { documents } = fixture;
                const order = fixture.open(ORDER.path, ORDER.content);
                const revision = fixture.revision(order);

                await expect(documents.write(order, EDITED, revision)).resolves.toBe(true);
                await expect(documents.write(order, EDITED_AGAIN, revision)).resolves.toBe(true);

                expect(fixture.revision(order)).toBe(revision);
                expect(read(order)).toEqual({ content: EDITED_AGAIN, hostContent: EDITED_AGAIN });
            });

            it("reads what the host's document holds after a write with CRLF line endings", async () => {
                const order = fixture.open(ORDER.path, ORDER.content);

                await expect(
                    fixture.documents.write(
                        order,
                        EDITED.replace(/\n/g, "\r\n"),
                        fixture.revision(order),
                    ),
                ).resolves.toBe(true);

                const { content, hostContent } = read(order);
                expect({ content, normalized: normalizeLineEndings(content) }).toEqual({
                    content: hostContent,
                    normalized: EDITED,
                });
            });

            it("writes only the editor it names, checked against that editor's own revision", async () => {
                const { order, invoice } = openOrderAndInvoice();
                fixture.editElsewhere(order, CHANGED_ELSEWHERE);

                await expect(
                    fixture.documents.write(invoice, EDITED, fixture.revision(invoice)),
                ).resolves.toBe(true);

                expect({ order: read(order), invoice: read(invoice) }).toEqual({
                    order: { content: CHANGED_ELSEWHERE, hostContent: CHANGED_ELSEWHERE },
                    invoice: { content: EDITED, hostContent: EDITED },
                });
            });
        });

        describe("saving", () => {
            it.each([
                {
                    state: "after a write",
                    prepare: async (documents: DocumentPort, editorId: string) => {
                        await documents.write(editorId, EDITED);
                    },
                },
                { state: "with nothing to save", prepare: async () => undefined },
            ])("reports a save $state as saved", async ({ prepare }) => {
                const order = fixture.open(ORDER.path, ORDER.content);
                await prepare(fixture.documents, order);

                await expect(fixture.documents.save(order)).resolves.toBe(true);
            });

            // A deploy reads the file from disk, so it stops on a save that did not happen.
            it("reports a save the host could not complete as not saved, and saves the other editors", async () => {
                const { documents } = fixture;
                const { order, invoice } = openOrderAndInvoice();
                await documents.write(order, EDITED);
                await documents.write(invoice, EDITED_AGAIN);
                fixture.failSaves(order);

                await expect(documents.save(order)).resolves.toBe(false);
                await expect(documents.save(invoice)).resolves.toBe(true);
            });
        });
    });
}
