import { WorkspaceTrustSnapshot } from "../../protocol/domain/types";

/** The bridge's copy of the project's trust; keeps the newest snapshot the host sent. */
export interface WorkspaceTrustMirror {
    apply(snapshot: WorkspaceTrustSnapshot): void;
}
