import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above all imports, so the factory cannot reference
// top-level consts. The EventEmitter shape `{ event, fire, dispose }` is
// defined inline; the subject subscribes through `.event` and publishes via
// `.fire`, which is the only contract the production code relies on.
vi.mock("vscode", () => {
    class EventEmitter<T> {
        private listeners: ((value: T) => void)[] = [];

        readonly event = (listener: (value: T) => void) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };

        fire(value: T): void {
            for (const listener of this.listeners) {
                listener(value);
            }
        }

        dispose(): void {
            this.listeners = [];
        }
    }

    class Disposable {
        constructor(private readonly callOnDispose: () => void) {}

        dispose(): void {
            this.callOnDispose();
        }
    }

    // The subject throws this and the test asserts via identity of the marker
    // `code`, mirroring how vscode tags FileNotFound errors.
    const FileSystemError = {
        FileNotFound: (uri: unknown) => {
            const error = new Error(`FileNotFound: ${JSON.stringify(uri)}`);
            (error as Error & { code: string }).code = "FileNotFound";
            return error;
        },
    };

    return {
        EventEmitter,
        Disposable,
        FileSystemError,
        FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
        FileChangeType: { Changed: 0, Created: 1, Deleted: 2 },
        Uri: {
            parse: (value: string) => {
                const path = value.replace(/^bpmn-script:/, "");
                return { scheme: "bpmn-script", path };
            },
        },
    };
});

import { FileChangeType, FileType, Uri } from "vscode";

import { BpmnScriptFileSystem } from "./BpmnScriptFileSystem";

interface CapturedChange {
    type: number;
    uri: { path: string };
}

/** Builds the subject plus an accessor over the change events it fired. */
function createFs() {
    const sut = new BpmnScriptFileSystem();
    const captured: CapturedChange[] = [];
    sut.onDidChangeFile((events) => {
        captured.push(...(events as unknown as CapturedChange[]));
    });
    return { sut, captured };
}

function uri(path: string): Uri {
    return { scheme: "bpmn-script", path } as unknown as Uri;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnScriptFileSystem.stat", () => {
    it("throws FileNotFound for an untracked URI", () => {
        const { sut } = createFs();

        expect(() => sut.stat(uri("/missing.js"))).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
    });

    it("reports the byte size of a tracked file", () => {
        const { sut } = createFs();
        sut.writeFile(uri("/a/script.js"), new Uint8Array([1, 2, 3]));

        const stat = sut.stat(uri("/a/script.js"));

        expect(stat.type).toBe(FileType.File);
        expect(stat.size).toBe(3);
    });
});

describe("BpmnScriptFileSystem.readFile", () => {
    it("throws FileNotFound for an untracked URI", () => {
        const { sut } = createFs();

        expect(() => sut.readFile(uri("/missing.js"))).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
    });

    it("returns the stored byte content", () => {
        const { sut } = createFs();
        const content = new Uint8Array([10, 20]);
        sut.writeFile(uri("/a/script.js"), content);

        expect(sut.readFile(uri("/a/script.js"))).toBe(content);
    });
});

describe("BpmnScriptFileSystem.writeFile", () => {
    it("fires Created on first write and Changed on overwrite", () => {
        const { sut, captured } = createFs();

        sut.writeFile(uri("/a/script.js"), new Uint8Array([1]));
        sut.writeFile(uri("/a/script.js"), new Uint8Array([2]));

        expect(captured.map((c) => c.type)).toEqual([
            FileChangeType.Created,
            FileChangeType.Changed,
        ]);
        expect(captured.every((c) => c.uri.path === "/a/script.js")).toBe(true);
    });
});

describe("BpmnScriptFileSystem.readDirectory", () => {
    it("lists only direct children and excludes nested entries", () => {
        const { sut } = createFs();
        sut.writeFile(uri("/dir/a.js"), new Uint8Array());
        sut.writeFile(uri("/dir/b.js"), new Uint8Array());
        sut.writeFile(uri("/dir/sub/c.js"), new Uint8Array());
        sut.writeFile(uri("/other/d.js"), new Uint8Array());

        const entries = sut.readDirectory(uri("/dir"));

        expect(entries).toEqual([
            ["a.js", FileType.File],
            ["b.js", FileType.File],
        ]);
    });

    it("treats a trailing-slash directory URI the same as without", () => {
        const { sut } = createFs();
        sut.writeFile(uri("/dir/a.js"), new Uint8Array());

        expect(sut.readDirectory(uri("/dir/"))).toEqual([["a.js", FileType.File]]);
    });
});

describe("BpmnScriptFileSystem.delete", () => {
    it("removes the file and fires a Deleted event", () => {
        const { sut, captured } = createFs();
        sut.writeFile(uri("/a/script.js"), new Uint8Array([1]));
        captured.length = 0;

        sut.delete(uri("/a/script.js"));

        expect(captured).toEqual([
            { type: FileChangeType.Deleted, uri: { scheme: "bpmn-script", path: "/a/script.js" } },
        ]);
        expect(() => sut.readFile(uri("/a/script.js"))).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
    });
});

describe("BpmnScriptFileSystem.rename", () => {
    it("moves content and fires Deleted then Created", () => {
        const { sut, captured } = createFs();
        const content = new Uint8Array([7]);
        sut.writeFile(uri("/a/old.js"), content);
        captured.length = 0;

        sut.rename(uri("/a/old.js"), uri("/a/new.js"));

        expect(captured.map((c) => [c.type, c.uri.path])).toEqual([
            [FileChangeType.Deleted, "/a/old.js"],
            [FileChangeType.Created, "/a/new.js"],
        ]);
        expect(sut.readFile(uri("/a/new.js"))).toBe(content);
        expect(() => sut.readFile(uri("/a/old.js"))).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
    });

    it("throws FileNotFound when the source does not exist", () => {
        const { sut } = createFs();

        expect(() => sut.rename(uri("/a/old.js"), uri("/a/new.js"))).toThrow(
            expect.objectContaining({ code: "FileNotFound" }),
        );
    });
});

describe("BpmnScriptFileSystem.deleteByPrefix", () => {
    it("fires one Deleted event per matching file and leaves others intact", () => {
        const { sut, captured } = createFs();
        sut.writeFile(uri("/hash/a.js"), new Uint8Array());
        sut.writeFile(uri("/hash/sub/b.js"), new Uint8Array());
        sut.writeFile(uri("/keep/c.js"), new Uint8Array());
        captured.length = 0;

        sut.deleteByPrefix("/hash/");

        const deletedPaths = captured.map((c) => c.uri.path).sort();
        expect(captured.every((c) => c.type === FileChangeType.Deleted)).toBe(true);
        expect(deletedPaths).toEqual(["/hash/a.js", "/hash/sub/b.js"]);
        expect(sut.readFile(uri("/keep/c.js"))).toBeInstanceOf(Uint8Array);
    });
});
