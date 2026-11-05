import { describe, expect, it } from "vitest";

import type { DocumentSession } from "../port/documentSession";
import type { ModelCanvas } from "../port/modelCanvas";
import { syncDocument } from "./documentSync";

class FakeSession implements DocumentSession {
    readonly changes: string[] = [];
    readonly calls: string[] = [];
    disposed = false;
    private replaceListener: ((text: string) => void) | undefined;
    private saveListener: (() => Promise<void>) | undefined;

    constructor(
        public value: string,
        readonly readOnly = false,
    ) {}

    onReplace(listener: (text: string) => void): () => void {
        this.replaceListener = listener;
        return () => (this.replaceListener = undefined);
    }

    change(text: string): void {
        this.value = text;
        this.changes.push(text);
        this.calls.push(`change ${text}`);
    }

    flush(): Promise<void> {
        this.calls.push("flush");
        return Promise.resolve();
    }

    onSaveRequested(listener: () => Promise<void>): () => void {
        this.saveListener = listener;
        return () => (this.saveListener = undefined);
    }

    dispose(): void {
        this.disposed = true;
    }

    replace(text: string): void {
        this.value = text;
        this.replaceListener?.(text);
    }

    save(): Promise<void> {
        return this.saveListener?.() ?? Promise.resolve();
    }
}

class FakeCanvas implements ModelCanvas {
    readonly imported: string[] = [];
    shown = "";
    refuses = (text: string) => text.includes("broken");
    pendingInput: string | undefined;
    private editListener: (() => void) | undefined;
    private heldExport: ((text: string) => void) | undefined;
    holdExports = false;

    async importText(text: string): Promise<boolean> {
        this.imported.push(text);
        if (this.refuses(text)) return false;
        this.shown = text;
        return true;
    }

    exportText(): Promise<string> {
        if (!this.holdExports) return Promise.resolve(`exported ${this.shown}`);
        return new Promise((resolve) => (this.heldExport = resolve));
    }

    applyPendingInput(): void {
        if (this.pendingInput === undefined) return;
        this.edit(this.pendingInput);
        this.pendingInput = undefined;
    }

    onEdit(listener: () => void): () => void {
        this.editListener = listener;
        return () => (this.editListener = undefined);
    }

    edit(text: string): void {
        this.shown = text;
        this.editListener?.();
    }

    releaseExport(text: string): void {
        this.heldExport?.(text);
    }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("syncDocument", () => {
    it("shows the tab's text and writes nothing on open", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        const sync = syncDocument(session, canvas);
        await sync.ready;
        expect(canvas.imported).toEqual(["a"]);
        expect(session.changes).toEqual([]);
    });

    it("writes the canvas's text after an edit", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        await syncDocument(session, canvas).ready;
        canvas.edit("b");
        await settled();
        expect(session.changes).toEqual(["exported b"]);
    });

    it("writes nothing when the export equals the tab's text", async () => {
        const session = new FakeSession("exported a");
        const canvas = new FakeCanvas();
        await syncDocument(session, canvas).ready;
        canvas.edit("a");
        await settled();
        expect(session.changes).toEqual([]);
    });

    it("shows an outside write", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        const sync = syncDocument(session, canvas);
        await sync.ready;
        session.replace("agent");
        await sync.imported();
        expect(canvas.imported).toEqual(["a", "agent"]);
        expect(session.changes).toEqual([]);
    });

    it("drops an export that started before an outside write", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        const sync = syncDocument(session, canvas);
        await sync.ready;
        canvas.holdExports = true;
        canvas.edit("mine");
        session.replace("agent");
        await sync.imported();
        canvas.releaseExport("exported mine");
        await settled();
        expect(session.changes).toEqual([]);
        expect(session.value).toBe("agent");
    });

    it("never writes a read-only tab", async () => {
        const session = new FakeSession("a", true);
        const canvas = new FakeCanvas();
        await syncDocument(session, canvas).ready;
        canvas.edit("b");
        await settled();
        expect(session.changes).toEqual([]);
    });

    it("writes nothing after a refused import until an import succeeds", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        const sync = syncDocument(session, canvas);
        await sync.ready;
        session.replace("broken");
        await sync.imported();
        canvas.edit("b");
        await settled();
        expect(session.changes).toEqual([]);

        session.replace("c");
        await sync.imported();
        canvas.edit("d");
        await settled();
        expect(session.changes).toEqual(["exported d"]);
    });

    it("sends input the panel still holds back before Orca saves", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        await syncDocument(session, canvas).ready;
        canvas.pendingInput = "typed";
        await session.save();
        expect(session.calls).toEqual(["change exported typed", "flush"]);
    });

    it("waits for an export still running before Orca saves", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        await syncDocument(session, canvas).ready;
        canvas.holdExports = true;
        canvas.edit("b");
        const saved = session.save();
        await settled();
        canvas.releaseExport("exported b");
        await saved;
        expect(session.calls).toEqual(["change exported b", "flush"]);
    });

    it("stops listening and ends the session once disconnected", async () => {
        const session = new FakeSession("a");
        const canvas = new FakeCanvas();
        const sync = syncDocument(session, canvas);
        await sync.ready;
        sync.disconnect();
        session.replace("agent");
        canvas.edit("b");
        await settled();
        expect(canvas.imported).toEqual(["a"]);
        expect(session.changes).toEqual([]);
        expect(session.disposed).toBe(true);
    });
});
