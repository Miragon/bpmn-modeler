import { describe, it, expect } from "vitest";

import { applyReadonly } from "./applyReadonly";

describe("applyReadonly", () => {
    it("disables every entry of a plain group and removes its add button", () => {
        const groups = [
            {
                id: "general",
                add: () => undefined,
                entries: [{ id: "name" }, { id: "id" }],
            },
        ];

        const [group] = applyReadonly(groups as any) as any[];

        expect(group.entries.every((e: any) => e.disabled === true)).toBe(true);
        expect("add" in group).toBe(false);
    });

    it("disables ListGroup item entries and strips add + per-item remove", () => {
        const groups = [
            {
                id: "extensions",
                add: () => undefined,
                items: [
                    {
                        id: "item-0",
                        remove: () => undefined,
                        entries: [{ id: "key" }, { id: "value" }],
                    },
                ],
            },
        ];

        const [group] = applyReadonly(groups as any) as any[];

        expect("add" in group).toBe(false);
        const [item] = group.items;
        expect("remove" in item).toBe(false);
        expect(item.entries.every((e: any) => e.disabled === true)).toBe(true);
    });

    it("covers custom/third-party groups too (runs on whatever is passed)", () => {
        const groups = [{ id: "myCustomGroup", entries: [{ id: "custom" }] }];

        const [group] = applyReadonly(groups as any) as any[];

        expect(group.entries[0].disabled).toBe(true);
    });

    it("tolerates null groups and groups without entries/items", () => {
        const groups = [null, { id: "empty" }];

        expect(() => applyReadonly(groups as any)).not.toThrow();
    });

    it("returns the same array instance (mutates in place)", () => {
        const groups = [{ id: "general", entries: [{ id: "name" }] }];

        expect(applyReadonly(groups as any)).toBe(groups);
    });
});
