import type { DocumentSession } from "../port/documentSession";
import type { ModelCanvas } from "../port/modelCanvas";

export interface DocumentSync {
    /** Settles once the tab's first text was shown or refused. */
    readonly ready: Promise<void>;
    /** Settles once every outside write received so far was shown or refused. */
    imported(): Promise<void>;
    disconnect(): void;
}

/**
 * Keeps a canvas and Orca's document of its tab in step: imports run one at a
 * time, and an edit's export is only sent while no newer import replaced what
 * it was exported from.
 */
export function syncDocument(session: DocumentSession, canvas: ModelCanvas): DocumentSync {
    let importCount = 0;
    let canWrite = false;
    let imports = Promise.resolve();
    let pushing = Promise.resolve();
    let connected = true;

    function show(text: string): Promise<void> {
        imports = imports.then(async () => {
            importCount += 1;
            canWrite = (await canvas.importText(text)) && !session.readOnly;
        });
        return imports;
    }

    async function push(): Promise<void> {
        if (!canWrite) return;
        const exportedAfter = importCount;
        await imports;
        const text = await canvas.exportText();
        if (!connected || !canWrite || exportedAfter !== importCount) return;
        if (text !== session.value) session.change(text);
    }

    const ready = show(session.value);
    const stopReplace = session.onReplace((text) => void show(text));
    const stopEdit = canvas.onEdit(() => {
        pushing = push();
    });
    const stopSave = session.onSaveRequested(async () => {
        canvas.applyPendingInput();
        await pushing;
        await session.flush();
    });

    return {
        ready,
        imported: () => imports,
        disconnect: () => {
            connected = false;
            stopReplace();
            stopEdit();
            stopSave();
            session.dispose();
        },
    };
}
