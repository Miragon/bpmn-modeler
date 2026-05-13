declare module "diagram-js/lib/core/EventBus" {
    export default class EventBus {
        on<T extends string>(event: T, callback: EventCallback, that?: any): void;
    }

    export type EventCallback<T extends string = any> = (event: EventType<T>, data: any) => any;

    export type EventType<T extends string> =
        EventMap extends Record<T, infer E> ? E : InternalEvent;

    interface EventMap {
        "commandStack.changed": CommandStackChangedEvent;
    }

    export interface InternalEvent {
        cancelBubble?: boolean;
        defaultPrevented?: boolean;
        [field: string]: any;

        init(data: any): void;
        stopPropagation(): void;
        preventDefault(): void;
    }

    export interface CommandStackChangedEvent extends InternalEvent {
        readonly type: "commandStack.changed";
    }
}
