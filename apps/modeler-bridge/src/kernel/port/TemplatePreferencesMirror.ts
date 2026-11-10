import { TemplatePreferencesSnapshot } from "../../protocol/domain/types";

/** The bridge's copy of the template switches the host stores; keeps the newest list of each scope. */
export interface TemplatePreferencesMirror {
    apply(snapshot: TemplatePreferencesSnapshot): void;
}
