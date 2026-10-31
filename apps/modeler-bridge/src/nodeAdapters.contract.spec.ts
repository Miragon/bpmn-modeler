import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

import { toWorkspacePath } from "@miragon/bpmn-modeler-core";
import { describeWorkspaceContract } from "@miragon/bpmn-modeler-core/testing";

import { NodeWorkspace } from "./nodeAdapters";

// chokidar arms its watch asynchronously; the adapter debounces each path by ~50 ms.
const WATCHER_ARMING_MS = 500;
const EVENT_DELIVERY_MS = 300;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describeWorkspaceContract("NodeWorkspace on a real directory", async () => {
    const root = toWorkspacePath(await fs.mkdtemp(join(tmpdir(), "workspace-contract-")));
    const workspace = new NodeWorkspace();
    return {
        workspace,
        root,
        openFolder: (folder) => workspace.registerRoot(folder),
        createDirectory: async (path) => {
            await fs.mkdir(path, { recursive: true });
        },
        moveDirectoryIn: async (path, files) => {
            const staging = await fs.mkdtemp(join(tmpdir(), "workspace-contract-staging-"));
            for (const [file, content] of Object.entries(files)) {
                const staged = join(staging, relative(path, file));
                await fs.mkdir(dirname(staged), { recursive: true });
                await fs.writeFile(staged, content);
            }
            await fs.rename(staging, path);
        },
        removeFile: (path) => fs.rm(path),
        watchersReady: () => sleep(WATCHER_ARMING_MS),
        eventsDelivered: () => sleep(EVENT_DELIVERY_MS),
        dispose: () => fs.rm(root, { recursive: true, force: true }),
    };
});
