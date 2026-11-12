import type { ModelerFileExtension } from "../../kernel/domain/modelerFileExtension";

/** The extension of a file format the diff panes and the compare commands open. */
export type DiffFileExtension = Extract<ModelerFileExtension, ".bpmn" | ".dmn">;
