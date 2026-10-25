import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./app/host";
import { ensureArrayToSorted, ensureUrlCanParse } from "./app/urlCompatibility";
import { bootstrap } from "./bootstrap";

ensureUrlCanParse();
ensureArrayToSorted();
const host = getHostApi();

installGlobalErrorForwarding((command) => host.postMessage(command));
window.addEventListener("DOMContentLoaded", () => bootstrap(host));
