import { bootstrap } from "@miragon/bpmn-modeler-webview";
import { mountDemoHeader, DemoGrayoutModule } from "../src";
import { BpmnDemoHost } from "./demoHost";

mountDemoHeader("bpmn");
bootstrap(new BpmnDemoHost(), { extraModules: [DemoGrayoutModule] });
