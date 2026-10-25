import "./styles/default.css";

import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./app/host";
import { bootstrap } from "./bootstrap";

const host = getHostApi();

// Registered eagerly so failures during form bootstrap are forwarded too.
installGlobalErrorForwarding((command) => host.postMessage(command));

window.onload = () => bootstrap(host);
