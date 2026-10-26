import { InMemoryWorkspace } from "./InMemoryWorkspace";
import { describeWorkspaceContract } from "./workspaceContract";

describeWorkspaceContract("InMemoryWorkspace", async () => {
    const workspace = new InMemoryWorkspace();
    return {
        workspace,
        root: "/contract",
        openFolder: (folder) => workspace.addFolder(folder),
        createDirectory: async (path) => workspace.createDirectory(path),
        removeFile: async (path) => workspace.deleteFile(path),
        watchersReady: async () => undefined,
        eventsDelivered: async () => undefined,
        dispose: async () => undefined,
    };
});
