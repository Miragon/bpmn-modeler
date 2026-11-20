import { HostApiImpl } from "@miragon/bpmn-modeler-shared";

import type { AddOnsHost } from "../../port/addOnsHost";
import { PreviewHost } from "./browserPreview/previewHost";

declare const process: { env: { NODE_ENV: string } };

/** The preview's stand-in host in `development`; the embedding host's channel in every other build. */
export function getHostApi(): AddOnsHost {
    if (process.env.NODE_ENV === "development") {
        return new PreviewHost(new URLSearchParams(window.location.search));
    }
    return new HostApiImpl();
}
