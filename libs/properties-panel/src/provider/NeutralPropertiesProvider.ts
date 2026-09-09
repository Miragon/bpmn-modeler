/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 *
 * The engine-neutral (standard-BPMN) properties provider — the replacement for
 * upstream `BpmnPropertiesProviderModule`. Group ids and entry ids are kept
 * identical to upstream so the C7/C8 providers (#1442) still splice into
 * `general`/`multiInstance`/`error`/… and existing i18n keys resolve unchanged.
 * The `bpmnFactory`-using entries resolve it optionally, so the same provider
 * serves a readonly `NavigatedViewer` (#1443) and an editable design modeler.
 */
import { Group } from "@bpmn-io/properties-panel";

import { getBpmnEntryId } from "./utils/EntryIdUtil";

import {
    AdHocCompletionProps,
    CompensationProps,
    DocumentationProps,
    ErrorProps,
    EscalationProps,
    ExecutableProps,
    IdProps,
    LinkProps,
    MessageProps,
    MultiInstanceProps,
    NameProps,
    ProcessProps,
    SignalProps,
    TimerProps,
} from "./properties";

function GeneralGroup(element: any, injector: any): any {
    const translate = injector.get("translate");

    const entries = [
        ...NameProps({ element }),
        ...IdProps(),
        ...ProcessProps({ element }),
        ...ExecutableProps({ element }),
    ];

    return {
        id: "general",
        label: translate("General"),
        entries,
        component: Group,
    };
}

function CompensationGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        label: translate("Compensation"),
        id: "compensation",
        component: Group,
        entries: [...CompensationProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function DocumentationGroup(element: any, injector: any): any {
    const translate = injector.get("translate");

    const entries = [...DocumentationProps({ element })];

    return {
        id: "documentation",
        label: translate("Documentation"),
        entries,
        component: Group,
    };
}

function ErrorGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        id: "error",
        label: translate("Error"),
        component: Group,
        entries: [...ErrorProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function MessageGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        id: "message",
        label: translate("Message"),
        component: Group,
        entries: [...MessageProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function SignalGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        id: "signal",
        label: translate("Signal"),
        component: Group,
        entries: [...SignalProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function LinkGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        label: translate("Link"),
        id: "link",
        component: Group,
        entries: [...LinkProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function EscalationGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        id: "escalation",
        label: translate("Escalation"),
        component: Group,
        entries: [...EscalationProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function TimerGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        label: translate("Timer"),
        id: "timer",
        component: Group,
        entries: [...TimerProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function MultiInstanceGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        label: translate("Multi-instance"),
        id: "multiInstance",
        component: Group,
        entries: [...MultiInstanceProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function AdHocCompletionGroup(element: any, injector: any): any {
    const translate = injector.get("translate");
    const group = {
        label: translate("Completion"),
        id: "adHocCompletion",
        component: Group,
        entries: [...AdHocCompletionProps({ element })],
    };

    if (group.entries.length) {
        return group;
    }

    return null;
}

function getGroups(element: any, injector: any): any[] {
    const groups = [
        GeneralGroup(element, injector),
        DocumentationGroup(element, injector),
        CompensationGroup(element, injector),
        ErrorGroup(element, injector),
        LinkGroup(element, injector),
        MessageGroup(element, injector),
        MultiInstanceGroup(element, injector),
        AdHocCompletionGroup(element, injector),
        SignalGroup(element, injector),
        EscalationGroup(element, injector),
        TimerGroup(element, injector),
    ];

    // contract: if a group returns null, it should not be displayed at all
    return groups.filter((group) => group !== null);
}

export default class NeutralPropertiesProvider {
    static $inject = ["propertiesPanel", "injector"];

    private _injector: any;

    constructor(propertiesPanel: any, injector: any) {
        propertiesPanel.registerProvider(this);
        this._injector = injector;
    }

    getGroups(element: any) {
        return (groups: any[]) => {
            groups = groups.concat(getGroups(element, this._injector));
            return groups;
        };
    }

    getEntryId(element: any, path: any): string | null {
        return getBpmnEntryId(element, path);
    }
}
