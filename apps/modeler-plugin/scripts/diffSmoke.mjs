/**
 * Headless smoke test for the out-of-process BPMN diff seam.
 *
 * Spawns the bundled core (`dist/host-bridge/server.js`) and drives the full
 * `diff/*` protocol the IntelliJ host will drive — open, both panes request
 * their file and report ready — then asserts the core ran `bpmn-js-differ` and
 * posted an `ApplyDiffHighlightsQuery` back to *each* side. This proves the
 * reused `BpmnDiffService` (and `bpmn-moddle` / `bpmn-js-differ`) runs under
 * plain Node before any IntelliJ/JCEF wiring is involved.
 *
 * Run after `corepack yarn build:bridge`:
 *   node apps/modeler-plugin/scripts/diffSmoke.mjs
 * Exits 0 on success, 1 on failure/timeout.
 */

/* global process, console, setTimeout, clearTimeout */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, "../../../dist/host-bridge/server.js");

const BEFORE_URI = "file:///tmp/diagram.bpmn#before";
const AFTER_URI = "file:///tmp/diagram.bpmn#after";

const BEFORE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="156" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// Same diagram with an added task + connecting flow — the differ must report it
// as `_added`, which surfaces on the after pane's highlights.
const AFTER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="New Task">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="156" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="250" y="78" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="192" y="118" />
        <di:waypoint x="250" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const child = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });

function send(method, params) {
    child.stdin.write(JSON.stringify({ method, params }) + "\n");
}

// Track which sides answered with highlights; success = both.
const highlighted = new Set();
let settled = false;

function finish(ok, reason) {
    if (settled) {
        return;
    }
    settled = true;
    clearTimeout(timer);
    child.kill();
    if (ok) {
        console.log("✅ diff smoke passed: ApplyDiffHighlightsQuery received for both panes");
        process.exit(0);
    } else {
        console.error(`❌ diff smoke failed: ${reason}`);
        process.exit(1);
    }
}

const timer = setTimeout(() => finish(false, "timed out waiting for highlights"), 15_000);

let buffer = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (line) {
            handleFrame(JSON.parse(line));
        }
    }
});

function handleFrame(frame) {
    if (frame.method !== "diff/postMessage") {
        return;
    }
    const { paneUri, message } = frame.params;
    // Reply to the viewer-file post by reporting ready, exactly as a real
    // webview would after importing the XML.
    if (message?.type === "BpmnFileQuery") {
        send("diff/webviewMessage", { paneUri, message: { type: "DiffReadyCommand" } });
    } else if (message?.type === "ApplyDiffHighlightsQuery") {
        highlighted.add(message.side);
        if (highlighted.has("before") && highlighted.has("after")) {
            finish(true);
        }
    }
}

// 1) Open the diff, then 2) each pane asks for its file (the webview's first act).
send("diff/open", {
    diffId: "smoke-1",
    origin: "compare-files",
    before: { uri: BEFORE_URI, content: BEFORE_XML },
    after: { uri: AFTER_URI, content: AFTER_XML },
});
send("diff/webviewMessage", { paneUri: BEFORE_URI, message: { type: "GetBpmnFileCommand" } });
send("diff/webviewMessage", { paneUri: AFTER_URI, message: { type: "GetBpmnFileCommand" } });
