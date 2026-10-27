import { StatusView } from "../../../kernel/domain/statusView";
import { TemplateLoadDisplay } from "./TemplateLoadStatus";

export function elementTemplatesStatusView(display: TemplateLoadDisplay): StatusView | undefined {
    switch (display.state) {
        case "hidden":
            return undefined;
        case "loading":
            return { text: "Loading element templates…", icon: "loading", tone: "neutral" };
        case "ready":
            return {
                text: `Element templates (${display.count})`,
                icon: "check",
                tone: "neutral",
                transient: true,
            };
    }
}
