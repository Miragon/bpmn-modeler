import type { ModelerFileExtension } from "../../kernel/domain/modelerFileExtension";
import { EditorSessionDocuments } from "./EditorSessionDocuments";
import { EditorSessionStore } from "./EditorSessionStore";

type EngineSelector = (editorId: string) => Promise<boolean>;

export class EngineVersionSelectionService {
    constructor(
        private readonly store: EditorSessionStore,
        private readonly document: EditorSessionDocuments,
        private readonly selectors: Partial<Record<ModelerFileExtension, EngineSelector>>,
    ) {}

    async changeEngineVersion(editorId: string): Promise<boolean> {
        if (!this.store.hasEditor(editorId)) return false;
        const path = this.document.getFilePath(editorId).toLowerCase();
        for (const extension of Object.keys(this.selectors) as ModelerFileExtension[]) {
            const select = this.selectors[extension];
            if (select && path.endsWith(extension)) return select(editorId);
        }
        return false;
    }
}
