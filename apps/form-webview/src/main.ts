import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./adapter/out/host";
import { ensureArrayToSorted, ensureUrlCanParse } from "@miragon/bpmn-modeler-types";
import { bootstrap } from "./composition/bootstrap";

ensureUrlCanParse();
ensureArrayToSorted();
const host = getHostApi();

installGlobalErrorForwarding((command) => host.postMessage(command));
window.addEventListener("DOMContentLoaded", () => bootstrap(host));
