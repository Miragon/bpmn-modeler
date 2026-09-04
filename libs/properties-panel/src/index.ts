/**
 * `@miragon/bpmn-modeler-properties-panel` — an engine-neutral properties panel
 * for bpmn-js (issue #1441, epic #1438).
 *
 * A fork of `bpmn-js-properties-panel` v5.65.0 (MIT — see LICENSE-upstream)
 * split into four composable bpmn-js DI modules:
 *
 * - {@link PropertiesPanelModule} — the panel renderer. Optionalises the command
 *   stack so it mounts on a readonly `NavigatedViewer`, and derives a `readonly`
 *   flag (missing `modeling` service) that disables every entry and strips
 *   add/remove affordances.
 * - {@link NeutralPropertiesProviderModule} — the standard-BPMN provider. Group
 *   and entry ids match upstream so C7/C8 providers still splice in (#1442) and
 *   existing i18n keys resolve.
 * - {@link ModeFilterModule} — a priority-10 groups→groups filter that reduces
 *   the panel to the neutral surface in `design` mode and is the identity in
 *   `implement` mode.
 * - {@link CustomGroupsModule} — the host slot marking which extra group ids
 *   survive design mode.
 *
 * The neutral design surface registers panel + provider + filter + slot; the
 * implement surface (#1442) registers the same four alongside the engine
 * providers and flips the filter to `implement`.
 */
import "./properties-panel.css";

export { default as PropertiesPanelModule } from "./render";
export { default as NeutralPropertiesProviderModule } from "./provider";
export { default as NeutralPropertiesProvider } from "./provider/NeutralPropertiesProvider";

export { ModeFilterModule, ModeFilterProvider } from "./modeFilter/ModeFilterProvider";
export type { PropertiesPanelMode } from "./modeFilter/ModeFilterProvider";
export { CustomGroupsModule, CustomGroupsRegistry } from "./customGroups/CustomGroupsRegistry";

export { useService } from "./hooks/useService";
export { applyReadonly } from "./render/applyReadonly";

export { NEUTRAL_GROUP_IDS } from "./modeFilter/engineGroupData";
