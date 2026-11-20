import { type FormEditorCommand, HostApiImpl } from "@miragon/bpmn-modeler-shared";

import type { FormHost, WebviewState } from "../../port/formHost";
import { PreviewHost } from "./browserPreview/previewHost";

declare const process: { env: { NODE_ENV: string } };

export function getHostApi(): FormHost {
    return process.env.NODE_ENV === "development"
        ? new PreviewHost()
        : new HostApiImpl<WebviewState, FormEditorCommand>();
}
