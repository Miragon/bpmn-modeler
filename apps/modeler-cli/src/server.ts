import express from "express";
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
 * Boots the HTTP + WebSocket server that hosts the webview and bridges
 * file I/O. Serves the pre-built `<kind>-webview` bundle (copied into
 * `dist/webviews/` at build time) as static assets, and exposes the
 * Command/Query protocol at `/bridge` over WebSocket.
 */
export async function startServer(options: StartServerOptions): Promise<StartedServer> {
    const port = options.port ?? (await findFreePort());
    const webviewRoot = path.resolve(__dirname, "webviews", `${options.kind}-webview`);

    const app = express();

    // Root URL returns the generated HTML (sets window.__WS_BRIDGE__ before
    // the webview bundle executes). Vendor assets (index.js, index.css, fonts,
    // themes) are served statically from the copied build output.
    app.get("/", (_req, res) => {
        res.type("html").send(renderHtml(options.kind, port));
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
