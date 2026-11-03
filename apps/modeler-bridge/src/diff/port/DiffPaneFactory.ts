import { DiffPaneHandle } from "@miragon/bpmn-modeler-core";

/** Builds a pane seeded with the side's XML, which IntelliJ sends with the diff. */
export type DiffPaneFactory = (uri: string, content: string) => DiffPaneHandle;
