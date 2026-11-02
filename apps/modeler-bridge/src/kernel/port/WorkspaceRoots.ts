/** The roots the host reports; reference-counted, so a command's temporary claim keeps a session's. */
export interface WorkspaceRoots {
    registerRoot(root: string): void;
    unregisterRoot(root: string): void;
}
