import type { HostApi, TemplateEditorCommand } from "@miragon/bpmn-modeler-shared";

/** The template editor persists no webview state, so its state type is `unknown`. */
export type TemplateEditorHost = HostApi<unknown, TemplateEditorCommand>;
