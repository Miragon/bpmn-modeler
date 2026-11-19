import { HostApiImpl, type TemplateEditorCommand } from "@miragon/bpmn-modeler-shared";

import type { TemplateEditorHost } from "../../port/templateEditorHost";
import { PreviewHost } from "./browserPreview/previewHost";

declare const process: { env: { NODE_ENV: string } };

export function getTemplateEditorHostApi(): TemplateEditorHost {
    if (process.env.NODE_ENV === "development") {
        return new PreviewHost();
    }
    return new HostApiImpl<unknown, TemplateEditorCommand>();
}
