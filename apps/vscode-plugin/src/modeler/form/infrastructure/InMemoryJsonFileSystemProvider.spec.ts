import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeFileSystemFake"));

import { FileChangeType, FileType, Uri } from "vscode";

import { InMemoryJsonFileSystemProvider } from "./InMemoryJsonFileSystemProvider";

const ROOT = Uri.parse("bpmn-form-input-values://session-a/");
const INPUT = Uri.parse("bpmn-form-input-values://session-a/order.input.json");
const OTHER_SESSION_INPUT = Uri.parse("bpmn-form-input-values://session-b/invoice.input.json");
const CREATE_OR_OVERWRITE = { create: true, overwrite: true };

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (content: Uint8Array) => new TextDecoder().decode(content);

function recordChanges(provider: InMemoryJsonFileSystemProvider) {
    const changes: { type: FileChangeType; uri: string }[] = [];
    provider.onDidChangeFile((events) =>
        changes.push(...events.map((event) => ({ type: event.type, uri: event.uri.toString() }))),
    );
    return changes;
}

afterEach(() => {
    vi.useRealTimers();
});

describe("InMemoryJsonFileSystemProvider", () => {
    it("serves written content and stats it as a file", () => {
        const provider = new InMemoryJsonFileSystemProvider();

        provider.setContent(INPUT, '{"amount":1}');

        expect(text(provider.readFile(INPUT))).toBe('{"amount":1}');
        expect(provider.stat(INPUT)).toMatchObject({ type: FileType.File, size: 12 });
        expect(provider.stat(ROOT)).toMatchObject({ type: FileType.Directory });
    });

    it("reports a missing file as FileNotFound", () => {
        const provider = new InMemoryJsonFileSystemProvider();

        expect(() => provider.readFile(INPUT)).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
        expect(() => provider.stat(INPUT)).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
    });

    it("keeps its own copy of the bytes", () => {
        const provider = new InMemoryJsonFileSystemProvider();
        const written = bytes("{}");
        provider.writeFile(INPUT, written, CREATE_OR_OVERWRITE);

        written[0] = 0;
        provider.readFile(INPUT)[1] = 0;

        expect(text(provider.readFile(INPUT))).toBe("{}");
    });

    it("honours the create and overwrite flags of a user write", () => {
        const provider = new InMemoryJsonFileSystemProvider();

        expect(() =>
            provider.writeFile(INPUT, bytes("{}"), { create: false, overwrite: true }),
        ).toThrow(expect.objectContaining({ code: "FileNotFound" }));

        provider.writeFile(INPUT, bytes("{}"), { create: true, overwrite: false });

        expect(() =>
            provider.writeFile(INPUT, bytes("[]"), { create: true, overwrite: false }),
        ).toThrow(expect.objectContaining({ code: "FileExists" }));
        expect(text(provider.readFile(INPUT))).toBe("{}");
    });

    it("rejects user writes to a read-only provider while the host can still update it", () => {
        const provider = new InMemoryJsonFileSystemProvider(true);

        provider.setContent(INPUT, '{"approved":true}');

        expect(() => provider.writeFile(INPUT, bytes("{}"), CREATE_OR_OVERWRITE)).toThrow(
            expect.objectContaining({ code: "NoPermissions" }),
        );
        expect(text(provider.readFile(INPUT))).toBe('{"approved":true}');
    });

    it("refuses to create directories, delete or rename through the explorer", () => {
        const provider = new InMemoryJsonFileSystemProvider();
        provider.setContent(INPUT, "{}");
        const noPermissions = expect.objectContaining({ code: "NoPermissions" });

        expect(() => provider.createDirectory(ROOT)).toThrow(noPermissions);
        expect(() => provider.delete(INPUT)).toThrow(noPermissions);
        expect(() => provider.rename(INPUT)).toThrow(noPermissions);
        expect(text(provider.readFile(INPUT))).toBe("{}");
    });

    it("announces creation, real changes and deletion exactly once each", () => {
        const provider = new InMemoryJsonFileSystemProvider();
        const changes = recordChanges(provider);

        provider.setContent(INPUT, "{}");
        provider.setContent(INPUT, "{}");
        provider.setContent(INPUT, '{"amount":1}');
        provider.deleteFile(INPUT);
        provider.deleteFile(INPUT);

        expect(changes).toEqual([
            { type: FileChangeType.Created, uri: INPUT.toString() },
            { type: FileChangeType.Changed, uri: INPUT.toString() },
            { type: FileChangeType.Deleted, uri: INPUT.toString() },
        ]);
        expect(() => provider.readFile(INPUT)).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
    });

    it("advances the modification time on every change, even within one millisecond", () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000);
        const provider = new InMemoryJsonFileSystemProvider();

        provider.setContent(INPUT, "{}");
        const created = provider.stat(INPUT);
        provider.setContent(INPUT, '{"amount":1}');
        const changed = provider.stat(INPUT);

        expect(created).toMatchObject({ ctime: 1_000, mtime: 1_000 });
        expect(changed).toMatchObject({ ctime: 1_000, mtime: 1_001 });
    });

    it("lists only the files of the requested session", () => {
        const provider = new InMemoryJsonFileSystemProvider();
        provider.setContent(INPUT, "{}");
        provider.setContent(OTHER_SESSION_INPUT, "{}");

        expect(provider.readDirectory(ROOT)).toEqual([["order.input.json", FileType.File]]);
        expect(() => provider.readDirectory(INPUT)).toThrow(
            expect.objectContaining({ code: "FileNotADirectory" }),
        );
    });
});
