import { opensOrcaDiff } from "./adapter/out/orcaFrame";

async function start(root: HTMLElement): Promise<void> {
    if (await opensOrcaDiff()) {
        const { startBpmnDiff } = await import("./composition/bpmnDiff");
        startBpmnDiff(root);
        return;
    }
    const { startBpmnEditor } = await import("./composition/bpmnEditor");
    await startBpmnEditor(root);
}

void start(document.getElementById("app")!);
