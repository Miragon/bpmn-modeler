import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./adapter/out/host";
import { bootstrap } from "./composition/bootstrap";

const host = getHostApi();

installGlobalErrorForwarding((command) => host.postMessage(command));
window.addEventListener("DOMContentLoaded", () => bootstrap(host));
