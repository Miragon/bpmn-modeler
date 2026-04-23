import * as path from "path";
import type { WebSocket } from "ws";

import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    detectExecutionPlatform,
    DmnFileQuery,
    ElementTemplatesQuery,
    LanguageQuery,
    TextClipboardQuery,
} from "@bpmn-modeler/shared";

import { FileAdapter } from "./fileAdapter";
import { WebviewKind } from "./server";

/** Shape of incoming parsed JSON messages from the webview. */
interface Incoming {
    readonly type: string;
    readonly [key: string]: unknown;
}

/**
 * Routes Command/Query messages between the webview (browser) and the
 * local filesystem. Mirrors {@link EditorStore.postMessage} from the VS
 * Code extension, minus all VS Code integrations.
 *
 * Keeps the clipboard in-process (no OS clipboard access in MVP — user
 * copy/paste via native browser shortcuts still works for text).
 */
export class MessageRouter {
    private clipboard = "";
    private textClipboard = "";
    private readonly sockets = new Set<WebSocket>();

    constructor(
        private readonly file: FileAdapter,
        private readonly kind: WebviewKind,
    ) {
        this.file.onExternalChange((content) => {
            const query = this.buildFileQuery(content);
            for (const socket of this.sockets) {
                if (socket.readyState === socket.OPEN) {
                    this.send(socket, query);
                }
            }
        });
    }

    attach(socket: WebSocket): void {
        this.sockets.add(socket);
        // Push language preference up-front — the webview does not request it.
        this.send(socket, new LanguageQuery("en"));

        socket.on("close", () => {
            this.sockets.delete(socket);
        });

        socket.on("message", async (raw) => {
            let message: Incoming;
            try {
                message = JSON.parse(raw.toString()) as Incoming;
            } catch {
                console.warn("[MessageRouter] Ignored non-JSON message from webview.");
                return;
            }
            try {
                await this.dispatch(socket, message);
            } catch (err) {
                console.error(`[MessageRouter] Handler failed for ${message.type}:`, err);
            }
        });
    }

    private async dispatch(socket: WebSocket, message: Incoming): Promise<void> {
        switch (message.type) {
            case "GetBpmnFileCommand":
            case "GetDmnFileCommand": {
                const content = await this.file.read();
                this.send(socket, this.buildFileQuery(content));
                return;
            }

            case "SyncDocumentCommand": {
                const content = (message as { content?: string }).content ?? "";
                await this.file.write(content);
                return;
            }

            case "GetBpmnModelerSettingCommand": {
                this.send(
                    socket,
                    new BpmnModelerSettingQuery({
                        alignToOrigin: false,
                        showTransactionBoundaries: false,
                        colorTheme: "light",
                    }),
                );
                return;
            }

            case "GetElementTemplatesCommand": {
                this.send(socket, new ElementTemplatesQuery([]));
                return;
            }

            case "GetClipboardCommand": {
                this.send(socket, new ClipboardQuery(this.clipboard));
                return;
            }

            case "SetClipboardCommand": {
                this.clipboard = (message as { text?: string }).text ?? "";
                return;
            }

            case "GetTextClipboardCommand": {
                this.send(socket, new TextClipboardQuery(this.textClipboard));
                return;
            }

            case "SetTextClipboardCommand": {
                this.textClipboard = (message as { text?: string }).text ?? "";
                return;
            }

            case "GetDiagramAsSVGCommand": {
                const svg = (message as { svg?: string }).svg ?? "";
                const base = path.basename(
                    this.file.filePath,
                    path.extname(this.file.filePath),
                );
                await this.file.writeSibling(`${base}.svg`, svg);
                return;
            }

            case "LogInfoCommand":
                console.info("[webview]", (message as { message?: string }).message ?? "");
                return;

            case "LogErrorCommand":
                console.error("[webview]", (message as { message?: string }).message ?? "");
                return;

            default:
                console.warn(`[MessageRouter] Unhandled message type: ${message.type}`);
        }
    }

    private buildFileQuery(content: string): BpmnFileQuery | DmnFileQuery {
        if (this.kind === "dmn") {
            return new DmnFileQuery(content);
        }
        return new BpmnFileQuery(content, detectPlatformSafely(content), "modeler");
    }

    private send(socket: WebSocket, payload: unknown): void {
        socket.send(JSON.stringify(payload));
    }
}

/**
 * Falls back to Camunda 7 when the XML lacks any version attribute or
 * namespace marker — matches the behaviour of most legacy diagrams.
 */
function detectPlatformSafely(xml: string): "c7" | "c8" {
    try {
        return detectExecutionPlatform(xml);
    } catch {
        return "c7";
    }
}
