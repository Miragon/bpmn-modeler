import { vi } from "vitest";

// VS Code's Workspace Trust: a grant fires once, and a withdrawal reloads the window.
const fakeTrust = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        isTrusted: false,
        listeners,
        grant(): void {
            if (this.isTrusted) return;
            this.isTrusted = true;
            listeners.forEach((listener) => listener());
        },
    };
});

vi.mock("vscode", () => ({
    workspace: {
        get isTrusted() {
            return fakeTrust.isTrusted;
        },
        onDidGrantWorkspaceTrust: (listener: () => void) => {
            fakeTrust.listeners.add(listener);
            return { dispose: () => fakeTrust.listeners.delete(listener) };
        },
    },
}));

import { describeWorkspaceTrustContract } from "@miragon/bpmn-modeler-core/testing";

import { VsCodeWorkspaceTrust } from "./VsCodeWorkspaceTrust";

describeWorkspaceTrustContract("VsCodeWorkspaceTrust over a fake Workspace Trust", async () => {
    fakeTrust.isTrusted = false;
    fakeTrust.listeners.clear();
    return { trust: new VsCodeWorkspaceTrust(), grant: async () => fakeTrust.grant() };
});
