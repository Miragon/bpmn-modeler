import express from "express";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import * as path from "path";
import { WebSocketServer } from "ws";

import { FileAdapter } from "./fileAdapter";
import { renderHtml } from "./html";
import { MessageRouter } from "./messageRouter";

export type WebviewKind = "bpmn" | "dmn";

export interface StartServerOptions {
    readonly filePath: string;
    readonly kind: WebviewKind;
    readonly port?: number;
}

export interface StartedServer {
    readonly url: string;
    readonly close: () => Promise<void>;
}

/**
 * Boots the HTTP + WebSocket server that hosts the webview and bridges file
 * I/O. Serves the pre-built `<kind>-webview` bundle as static assets and
 * exposes the Command/Query protocol at `/bridge` over WebSocket.
 */
export async function startServer(options: StartServerOptions): Promise<StartedServer> {
    const port = options.port ?? (await findFreePort());
    const webviewRoot = resolveWebviewRoot(options.kind);

    const app = express();

    // Root URL returns the generated HTML (sets window.__WS_BRIDGE__ before
    // the webview bundle executes). Vendor assets (index.js, index.css,
    // fonts, themes) are served statically from the copied build output.
    app.get("/", (_req, res) => {
        res.type("html").send(renderHtml(options.kind, port));
    });

    // The bpmn/dmn icon-font CSS lives under `css/…/css/` and references its
    // glyphs via `url(../font/…)`, which resolves to `css/…/font/…`. But the
    // webview's vite static-copy places the fonts under `font/…/font/…`
    // instead, so those requests 404 and palette/context-pad icons render as
    // boxes. Rewrite the `/css/…/font/<file>` requests to the real `/font/…`
    // location. (The proper fix belongs in the webview build's copy globs.)
    app.get(/^\/css\/(.+\/font\/[^/]+)$/, (req, res, next) => {
        res.sendFile(path.join(webviewRoot, "font", req.params[0]), (err) => {
            if (err) next();
        });
    });

    app.use(express.static(webviewRoot));

    const server = http.createServer(app);
    const wss = new WebSocketServer({ server, path: "/bridge" });
    const file = new FileAdapter(options.filePath);
    const router = new MessageRouter(file, options.kind);

    wss.on("connection", (socket) => {
        router.attach(socket);
    });

    await new Promise<void>((resolve) => server.listen(port, resolve));
    const url = `http://localhost:${port}`;

    const close = async () => {
        wss.close();
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
        file.dispose();
    };

    return { url, close };
}

/**
 * Locates the webview asset directory for the running form of the CLI.
 *
 * `__dirname` is unreliable in a Bun-compiled single binary (it points into
 * the embedded virtual filesystem, not the location on disk), so the
 * shipped assets are resolved relative to the executable itself
 * (`process.execPath`). When running from source (`bun run src/index.ts`)
 * the executable is the Bun runtime, so we fall back to the staging dir
 * next to this module.
 */
function resolveWebviewRoot(kind: WebviewKind): string {
    const candidates = [
        path.resolve(path.dirname(process.execPath), "webviews", `${kind}-webview`),
        path.resolve(__dirname, "webviews", `${kind}-webview`),
        path.resolve(__dirname, "..", "dist", "webviews", `${kind}-webview`),
    ];
    const root = candidates.find((dir) => fs.existsSync(path.join(dir, "index.js")));
    if (!root) {
        throw new Error(
            `Could not locate the ${kind}-webview assets. Looked in:\n  ${candidates.join("\n  ")}`,
        );
    }
    return root;
}

/** Asks the OS for an unused TCP port. */
function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on("error", reject);
        srv.listen(0, () => {
            const addr = srv.address();
            if (addr && typeof addr === "object") {
                const { port } = addr;
                srv.close(() => resolve(port));
            } else {
                srv.close(() => reject(new Error("Failed to pick a free port.")));
            }
        });
    });
}
