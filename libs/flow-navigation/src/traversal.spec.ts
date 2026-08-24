import { describe, expect, it } from "vitest";

import {
    resolveDeleteAnchor,
    resolveEntry,
    resolveFollow,
    resolveStep,
    type NavElement,
} from "./traversal";

// ---------------------------------------------------------------------------
// Graph builders — plain objects satisfying NavElement structurally.
// ---------------------------------------------------------------------------

function shape(id: string, type: string, x: number, y: number): NavElement {
    return { id, type, x, y, incoming: [], outgoing: [] };
}

function flow(id: string, src: NavElement, tgt: NavElement): NavElement {
    const f: NavElement = {
        id,
        type: "bpmn:SequenceFlow",
        x: 0,
        y: 0,
        incoming: [],
        outgoing: [],
        source: src,
        target: tgt,
    };
    src.outgoing.push(f);
    tgt.incoming.push(f);
    return f;
}

// ---------------------------------------------------------------------------
// resolveStep — Tab / Shift+Tab
// ---------------------------------------------------------------------------

describe("resolveStep", () => {
    it("linear forward: single outgoing jumps to target shape", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);

        expect(resolveStep(a, "forward")).toBe(b);
    });

    it("linear backward: single incoming jumps to source shape", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);

        expect(resolveStep(b, "backward")).toBe(a);
    });

    it("fan-out: Tab from gateway selects first outgoing flow (sorted by target y-then-x)", () => {
        const gw = shape("gw", "bpmn:ExclusiveGateway", 200, 200);
        const top = shape("top", "bpmn:Task", 300, 100);
        const mid = shape("mid", "bpmn:Task", 300, 200);
        const bot = shape("bot", "bpmn:Task", 300, 300);
        const f1 = flow("f1", gw, top);
        flow("f2", gw, mid);
        flow("f3", gw, bot);

        expect(resolveStep(gw, "forward")).toBe(f1);
    });

    it("fan cycling forward: Tab on flow cycles to next sibling with wrap", () => {
        const gw = shape("gw", "bpmn:ExclusiveGateway", 200, 200);
        const t1 = shape("t1", "bpmn:Task", 300, 100);
        const t2 = shape("t2", "bpmn:Task", 300, 200);
        const t3 = shape("t3", "bpmn:Task", 300, 300);
        const f1 = flow("f1", gw, t1);
        const f2 = flow("f2", gw, t2);
        const f3 = flow("f3", gw, t3);

        expect(resolveStep(f1, "forward")).toBe(f2);
        expect(resolveStep(f2, "forward")).toBe(f3);
        expect(resolveStep(f3, "forward")).toBe(f1);
    });

    it("fan cycling backward: Shift+Tab on flow cycles to previous sibling with wrap", () => {
        const gw = shape("gw", "bpmn:ExclusiveGateway", 200, 200);
        const t1 = shape("t1", "bpmn:Task", 300, 100);
        const t2 = shape("t2", "bpmn:Task", 300, 200);
        const t3 = shape("t3", "bpmn:Task", 300, 300);
        const f1 = flow("f1", gw, t1);
        const f2 = flow("f2", gw, t2);
        const f3 = flow("f3", gw, t3);

        expect(resolveStep(f3, "backward")).toBe(f2);
        expect(resolveStep(f2, "backward")).toBe(f1);
        expect(resolveStep(f1, "backward")).toBe(f3);
    });

    it("round-trip identity: Tab then Shift+Tab returns to the same flow", () => {
        const gw = shape("gw", "bpmn:ExclusiveGateway", 200, 200);
        const t1 = shape("t1", "bpmn:Task", 300, 100);
        const t2 = shape("t2", "bpmn:Task", 300, 200);
        const f1 = flow("f1", gw, t1);
        flow("f2", gw, t2);

        const next = resolveStep(f1, "forward");
        expect(resolveStep(next!, "backward")).toBe(f1);
    });

    it("fan-in merge: Tab on flow cycles through target's incoming", () => {
        const t1 = shape("t1", "bpmn:Task", 100, 100);
        const t2 = shape("t2", "bpmn:Task", 100, 200);
        const merge = shape("merge", "bpmn:ExclusiveGateway", 200, 150);
        const f1 = flow("f1", t1, merge);
        const f2 = flow("f2", t2, merge);

        expect(resolveStep(f1, "forward")).toBe(f2);
        expect(resolveStep(f2, "forward")).toBe(f1);
    });

    it("1-to-1 flow (mouse-selected): Tab → target, Shift+Tab → source", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);

        expect(resolveStep(f, "forward")).toBe(b);
        expect(resolveStep(f, "backward")).toBe(a);
    });

    it("end shape forward → null", () => {
        const end = shape("end", "bpmn:EndEvent", 400, 200);

        expect(resolveStep(end, "forward")).toBeNull();
    });

    it("start shape backward → null", () => {
        const start = shape("start", "bpmn:StartEvent", 100, 200);

        expect(resolveStep(start, "backward")).toBeNull();
    });

    it("boundary event backward → host shape", () => {
        const task = shape("task", "bpmn:Task", 200, 200);
        const boundary: NavElement = {
            ...shape("be", "bpmn:BoundaryEvent", 200, 280),
            host: task,
        };

        expect(resolveStep(boundary, "backward")).toBe(task);
    });

    it("label normalization: resolves through labelTarget", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);
        const label: NavElement = {
            ...shape("lbl", "label", 100, 80),
            labelTarget: a,
        };

        expect(resolveStep(label, "forward")).toBe(b);
    });

    it("message flows are filtered: only bpmn:SequenceFlow counts", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const mf: NavElement = {
            id: "mf1",
            type: "bpmn:MessageFlow",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
            source: a,
            target: b,
        };
        a.outgoing.push(mf);
        b.incoming.push(mf);

        expect(resolveStep(a, "forward")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// resolveDeleteAnchor — select predecessor after delete
// ---------------------------------------------------------------------------

describe("resolveDeleteAnchor", () => {
    it("single incoming → source", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);

        expect(resolveDeleteAnchor([b])).toBe(a);
    });

    it("fan-in → first by y-then-x", () => {
        const t1 = shape("t1", "bpmn:Task", 100, 200);
        const t2 = shape("t2", "bpmn:Task", 100, 100);
        const merge = shape("merge", "bpmn:ExclusiveGateway", 200, 150);
        flow("f1", t1, merge);
        flow("f2", t2, merge);

        expect(resolveDeleteAnchor([merge])).toBe(t2);
    });

    it("deleted-set skip → next surviving incoming source", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 100, 200);
        const c = shape("c", "bpmn:Task", 200, 150);
        flow("f1", a, c);
        flow("f2", b, c);

        expect(resolveDeleteAnchor([c, a])).toBe(b);
    });

    it("all incoming deleted → first outgoing target", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const c = shape("c", "bpmn:Task", 300, 100);
        flow("f1", a, b);
        flow("f2", b, c);

        expect(resolveDeleteAnchor([b, a])).toBe(c);
    });

    it("boundary event → host", () => {
        const task = shape("task", "bpmn:Task", 200, 200);
        const boundary: NavElement = {
            ...shape("be", "bpmn:BoundaryEvent", 200, 280),
            host: task,
        };

        expect(resolveDeleteAnchor([boundary])).toBe(task);
    });

    it("isolated element → null", () => {
        const a = shape("a", "bpmn:Task", 100, 100);

        expect(resolveDeleteAnchor([a])).toBeNull();
    });

    it("deleted connection → source", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);

        expect(resolveDeleteAnchor([f])).toBe(a);
    });

    it("deleted connection with deleted source → target", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);

        expect(resolveDeleteAnchor([f, a])).toBe(b);
    });

    it("label → resolves through labelTarget", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        flow("f1", a, b);
        const label: NavElement = {
            ...shape("lbl", "label", 200, 80),
            labelTarget: b,
        };

        expect(resolveDeleteAnchor([label])).toBe(a);
    });

    it("multi-delete chain [B, C] of A→B→C → A", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const c = shape("c", "bpmn:Task", 300, 100);
        flow("f1", a, b);
        flow("f2", b, c);

        expect(resolveDeleteAnchor([b, c])).toBe(a);
    });
});

// ---------------------------------------------------------------------------
// resolveFollow — Enter / Shift+Enter
// ---------------------------------------------------------------------------

describe("resolveFollow", () => {
    it("Enter on flow → target", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);

        expect(resolveFollow(f, "forward")).toBe(b);
    });

    it("Shift+Enter on flow → source", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);

        expect(resolveFollow(f, "backward")).toBe(a);
    });

    it("Enter on shape → null", () => {
        const a = shape("a", "bpmn:Task", 100, 100);

        expect(resolveFollow(a, "forward")).toBeNull();
    });

    it("Enter on message flow → null (not bpmn:SequenceFlow)", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const mf: NavElement = {
            id: "mf1",
            type: "bpmn:MessageFlow",
            x: 0,
            y: 0,
            incoming: [],
            outgoing: [],
            source: a,
            target: b,
        };

        expect(resolveFollow(mf, "forward")).toBeNull();
    });

    it("Enter on flow label → resolves through labelTarget", () => {
        const a = shape("a", "bpmn:Task", 100, 100);
        const b = shape("b", "bpmn:Task", 200, 100);
        const f = flow("f1", a, b);
        const label: NavElement = {
            ...shape("lbl", "label", 150, 80),
            labelTarget: f,
        };

        expect(resolveFollow(label, "forward")).toBe(b);
    });
});

// ---------------------------------------------------------------------------
// resolveEntry — empty selection
// ---------------------------------------------------------------------------

describe("resolveEntry", () => {
    it("forward → start event", () => {
        const start = shape("start", "bpmn:StartEvent", 100, 200);
        const task = shape("task", "bpmn:Task", 200, 200);
        flow("f1", start, task);

        expect(resolveEntry([start, task], "forward")).toBe(start);
    });

    it("forward → topmost start event when multiple exist", () => {
        const s1 = shape("s1", "bpmn:StartEvent", 100, 300);
        const s2 = shape("s2", "bpmn:StartEvent", 100, 100);

        expect(resolveEntry([s1, s2], "forward")).toBe(s2);
    });

    it("backward → end event", () => {
        const end = shape("end", "bpmn:EndEvent", 400, 200);
        const task = shape("task", "bpmn:Task", 200, 200);
        flow("f1", task, end);

        expect(resolveEntry([task, end], "backward")).toBe(end);
    });

    it("empty diagram → null", () => {
        expect(resolveEntry([], "forward")).toBeNull();
    });

    it("no start event: fallback to node with 0 sequence-incoming", () => {
        const task = shape("task", "bpmn:Task", 200, 200);

        expect(resolveEntry([task], "forward")).toBe(task);
    });

    it("filters out labels and connections from candidates", () => {
        const start = shape("start", "bpmn:StartEvent", 100, 200);
        const task = shape("task", "bpmn:Task", 200, 200);
        const f = flow("f1", start, task);
        const label: NavElement = {
            ...shape("lbl", "label", 150, 180),
            labelTarget: f,
        };

        expect(resolveEntry([start, task, f, label], "forward")).toBe(start);
    });

    it("collaboration: finds start events inside participants", () => {
        const start = shape("start", "bpmn:StartEvent", 150, 250);
        const participant: NavElement = {
            ...shape("p1", "bpmn:Participant", 100, 200),
            children: [start],
        };

        expect(resolveEntry([participant], "forward")).toBe(start);
    });
});
