import { bootstrap } from "@miragon/dmn-modeler-webview";
import { mountDemoHeader } from "../src";
import { DmnDemoHost } from "./demoHost";

mountDemoHeader("dmn");
bootstrap(new DmnDemoHost());
