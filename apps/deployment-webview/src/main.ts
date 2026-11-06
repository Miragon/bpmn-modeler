import "./adapter/in/styles/default.css";

import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./adapter/out/host";
import { bootstrap } from "./composition/bootstrap";

const host = getHostApi();

// Registered eagerly so failures during form bootstrap are forwarded too.
installGlobalErrorForwarding((command) => host.postMessage(command));

window.onload = () => bootstrap(host);
