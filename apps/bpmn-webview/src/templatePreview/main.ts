import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { bootstrapTemplatePreview } from "./bootstrap";
import { getPreviewHostApi } from "./host";
import "./templatePreview.css";

const host = getPreviewHostApi();
installGlobalErrorForwarding((command) => host.postMessage(command));
void bootstrapTemplatePreview(host);
