import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { bootstrapTemplateEditor } from "./bootstrap";
import { getTemplateEditorHostApi } from "./host";
import "./templateEditor.css";

const host = getTemplateEditorHostApi();
installGlobalErrorForwarding((command) => host.postMessage(command));
void bootstrapTemplateEditor(host);
