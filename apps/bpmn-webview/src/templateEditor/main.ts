import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { bootstrapTemplateEditor } from "./bootstrap";
import { getTemplateEditorHostApi } from "./host";
import "./templateEditor.css";

const host = getTemplateEditorHostApi();
installGlobalErrorForwarding((command) => host.postMessage(command));
// DEV-only: records the page's texts for the i18n overlay's harvest (libs/bpmn-i18n-extras/tools).
const harvested = import.meta.env.DEV
    ? ((window as { __harvested?: Set<string> }).__harvested ??= new Set<string>())
    : undefined;
void bootstrapTemplateEditor(host, { onTranslate: harvested && ((text) => harvested.add(text)) });
