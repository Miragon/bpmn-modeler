/**
 * Build the bpmn-iq Web UI URL.
 *
 * Two host-derivation rules:
 * 1. **Fly.io deployments** — daemon and Web UI live in two sibling apps
 *    named `<prefix>-server.fly.dev` / `<prefix>-web.fly.dev`. Swap the
 *    suffix so the deep-link lands in the right app.
 * 2. **Anything else** (localhost, custom hosts) — assume the Web UI sits
 *    on the same host as the daemon, on port 5173 (the Vite default).
 *
 * When `workspaceId` is provided, the deep-link form (`/?ws=<id>`) is
 * returned — that's what the upstream `apps/web` reads via
 * `URLSearchParams.get("ws")`.
 */
export function buildWebUiUrl(daemonUrl: string, workspaceId?: string): string {
    const fly = /^(https?:\/\/[^/]+?)-server\.fly\.dev/.exec(daemonUrl);
    const base = fly
        ? `${fly[1]}-web.fly.dev`
        : daemonUrl.replace(/:\d+$/, ":5173");
    return workspaceId
        ? `${base}/?ws=${encodeURIComponent(workspaceId)}`
        : base;
}
