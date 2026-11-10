import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist-mono/wght.css";
import "./adapter/in/styles/cd-tokens.generated.css";
import "./adapter/in/styles/base.css";
import "./adapter/in/styles/addOnsView.css";

import { installGlobalErrorForwarding } from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./adapter/out/host";
import { bootstrap } from "./composition/bootstrap";

const host = getHostApi();

// Registered eagerly so failures during bootstrap are forwarded too.
installGlobalErrorForwarding((command) => host.postMessage(command));

window.onload = () => bootstrap(host);
