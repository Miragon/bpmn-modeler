<script setup lang="ts">
import {
    computed,
    h,
    nextTick,
    onBeforeUnmount,
    onMounted,
    reactive,
    ref,
    type FunctionalComponent,
} from "vue";
import { withBase } from "vitepress";

const ICONS = {
    files: [
        { "stroke-width": "2" },
        '<path d="M20 7h-3a2 2 0 0 1-2-2V2" /><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z" /><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8" />',
    ],
    search: [{ "stroke-width": "2" }, '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />'],
    gitBranch: [
        { "stroke-width": "2" },
        '<line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />',
    ],
    gitBranchBold: [
        { "stroke-width": "2.5" },
        '<line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />',
    ],
    rocket: [
        { "stroke-width": "2" },
        '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />',
    ],
    chevronDown: [{ "stroke-width": "2.5" }, '<path d="m6 9 6 6 6-6" />'],
    chevronRight: [{ "stroke-width": "2.5" }, '<path d="m9 18 6-6-6-6" />'],
    chevronLeft: [{ "stroke-width": "2.5" }, '<path d="m15 18-6-6 6-6" />'],
    chevronsRight: [
        { "stroke-width": "2.5" },
        '<path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" />',
    ],
    chevronsRight3: [
        { "stroke-width": "2.5" },
        '<path d="m3 17 5-5-5-5" /><path d="m10 17 5-5-5-5" /><path d="m17 17 5-5-5-5" />',
    ],
    braces: [
        { "stroke-width": "2" },
        '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" /><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />',
    ],
    fileCode: [
        { "stroke-width": "2" },
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="m10 13-2 2 2 2M14 17l2-2-2-2" />',
    ],
    shieldCheck: [
        { "stroke-width": "2" },
        '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" />',
    ],
    form: [
        { "stroke-width": "2" },
        '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 8h10M7 12h6" /><rect x="7" y="15" width="10" height="3" rx="1" />',
    ],
    table: [
        { "stroke-width": "2" },
        '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 9v12M15 9v12" />',
    ],
    check: [{ "stroke-width": "2.5" }, '<path d="M20 6 9 17l-5-5" />'],
    close: [{ "stroke-width": "2" }, '<path d="M18 6 6 18M6 6l12 12" />'],
    task: [{ "stroke-width": "1.6" }, '<rect x="3" y="5" width="18" height="14" rx="3" />'],
    gateway: [{ "stroke-width": "1.6" }, '<path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />'],
    endEvent: [{ "stroke-width": "3" }, '<circle cx="12" cy="12" r="7.5" />'],
    startEvent: [{ "stroke-width": "1.6" }, '<circle cx="12" cy="12" r="8" />'],
    wrench: [
        { "stroke-width": "2" },
        '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />',
    ],
    trash: [
        { "stroke-width": "2" },
        '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    ],
    arrowUpRight: [{ "stroke-width": "2" }, '<path d="M7 17 17 7" /><path d="M8 7h9v9" />'],
    code: [{ "stroke-width": "2.2" }, '<path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" />'],
    searchBold: [
        { "stroke-width": "2.5" },
        '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
    ],
    templateService: [
        { "stroke-width": "1.8" },
        '<circle cx="12" cy="12" r="7" stroke-dasharray="2.6 2.4" stroke-width="3" /><circle cx="12" cy="12" r="2.5" />',
    ],
    menuUserTask: [
        { viewBox: "0 0 16 16", "stroke-width": "1.2" },
        '<rect x="1" y="2.5" width="14" height="11" rx="2" /><circle cx="5.5" cy="6" r="1.4" /><path d="M3.3 9.6c0-1.2.9-1.8 2.2-1.8s2.2.6 2.2 1.8" />',
    ],
    menuGateway: [
        { viewBox: "0 0 16 16", "stroke-width": "1.2" },
        '<path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" /><path d="M6 6l4 4M10 6l-4 4" stroke-width="1.6" />',
    ],
    toggleOff: [
        { "stroke-width": "2" },
        '<rect width="20" height="12" x="2" y="6" rx="6" /><circle cx="8" cy="12" r="2" />',
    ],
    toggleOn: [
        { "stroke-width": "2" },
        '<rect width="20" height="12" x="2" y="6" rx="6" /><circle cx="16" cy="12" r="2" fill="currentColor" />',
    ],
    focus: [
        { "stroke-width": "2" },
        '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="3" />',
    ],
    hand: [
        { "stroke-width": "2" },
        '<path d="M18 11V6a2 2 0 0 0-4 0" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />',
    ],
    lasso: [
        { "stroke-width": "2", "stroke-dasharray": "3 3" },
        '<rect x="4" y="4" width="16" height="16" rx="1" />',
    ],
    pause: [
        { fill: "currentColor", stroke: "none" },
        '<rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />',
    ],
    restart: [
        { "stroke-width": "2.5" },
        '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />',
    ],
    logList: [{ "stroke-width": "2.5" }, '<path d="M15 12H3M17 18H3M21 6H3" />'],
    gauge: [
        { "stroke-width": "2.5" },
        '<path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />',
    ],
    userTask: [
        { "stroke-width": "1.5" },
        '<rect x="1.5" y="4" width="21" height="16" rx="3" /><circle cx="8" cy="9" r="2" /><path d="M4.8 14.6c0-1.8 1.4-2.7 3.2-2.7s3.2.9 3.2 2.7" />',
    ],
    error: [
        { "stroke-width": "2.5" },
        '<circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" />',
    ],
    warning: [
        { "stroke-width": "2.5" },
        '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4M12 17h.01" />',
    ],
    logStart: [
        { "stroke-width": "2.5" },
        '<circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" />',
    ],
    logTask: [{ "stroke-width": "2.5" }, '<rect x="3" y="5" width="18" height="14" rx="3" />'],
    logEnd: [{ "stroke-width": "4" }, '<circle cx="12" cy="12" r="8" />'],
} satisfies Record<string, [Record<string, string>, string]>;
type IconName = keyof typeof ICONS;

const Icon: FunctionalComponent<{ name: IconName }> = ({ name }) =>
    h("svg", {
        "viewBox": "0 0 24 24",
        "fill": "none",
        "stroke": "currentColor",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...ICONS[name][0],
        "innerHTML": ICONS[name][1],
    });
Icon.props = ["name"];

const STEPS = [
    { name: "Model", text: "Append the next step from the canvas." },
    { name: "Simulate", text: "Run a token through every path." },
    { name: "Code", text: "Jump from a task to its code, DMN or form." },
    { name: "Review", text: "See a Git change side by side." },
    { name: "Deploy", text: "Deploy and start an instance." },
];

const MENU_ITEMS: { label: string; icon: IconName; template?: boolean }[] = [
    { label: "Payment Service", icon: "templateService", template: true },
    { label: "Shipping Service", icon: "templateService", template: true },
    { label: "User task", icon: "menuUserTask" },
    { label: "Exclusive gateway", icon: "menuGateway" },
];

const JOB_WORKER_LINE = 5;
const JAVA_LINES: [string, string][][] = [
    [
        ["k", "package"],
        ["", " io.miragon.shop;"],
    ],
    [],
    [["a", "@Component"]],
    [
        ["k", "public class"],
        ["", " ChargePaymentWorker {"],
    ],
    [],
    [
        ["", "    "],
        ["a", "@JobWorker"],
        ["", "(type = "],
        ["s", '"charge-payment"'],
        ["", ")"],
    ],
    [
        ["", "    "],
        ["k", "public"],
        ["", " Map<String, Object> charge("],
        ["a", "@Variable"],
        ["", " String orderId) {"],
    ],
    [
        ["", "        "],
        ["k", "var"],
        ["", " receipt = payments.charge(orderId);"],
    ],
    [
        ["", "        "],
        ["k", "return"],
        ["", " Map.of("],
        ["s", '"paymentId"'],
        ["", ", receipt.id());"],
    ],
    [["", "    }"]],
    [["", "}"]],
];

const GIT_LINES: [string, string][] = [
    ["$", " git log --oneline -2"],
    ["a41c9e2", " Model order process"],
    ["7d03b1f", " Add payment worker"],
    ["$", " git diff --stat"],
    ["", " order.bpmn      | 18 ++++++++++++---"],
    ["", " ship-order.form | 24 ++++++++++++++++"],
    ["", " 2 files changed, 39 insertions(+), 3 deletions(-)"],
];
const DEPLOY_LINES: [string, string][] = [
    ["[10:42:07]", " Deploying order.bpmn to dev (Camunda Cloud 8)"],
    ["[10:42:08]", " Deployed order.bpmn, version 4"],
    ["[10:42:08]", " Started instance of order-process"],
];

// The canvas camera fits the model into whatever the open side bar, properties panel and output
// panel leave free, in units of the diagram's viewBox.
const VIEW = { w: 464, h: 100 };
const MAX_SCALE = 1.15;
const ACTIVITY_W = 40;
const SIDE_W = 185;
const PANEL_W = 200;
const OUTPUT_H = 132;
const TABS_H = 34;
const CHARGE_PAYMENT = { left: 110, bottom: 96 };
const MODEL_BEAT_LIFT = 96;
const POP_W = 228;

const TOKEN_X = { start: 48, charge: 160, ship: 304, end: 416 };
const TOKEN_SPEED_PX_PER_MS = 0.24;
type TokenStop = keyof typeof TOKEN_X;
const FIRST_LOOP_DELAY_MS = 2200;
const REVIEW_BEAT = 3;

const bpmnIcon = withBase("/favicon-bpmn.svg");
const ideEl = ref<HTMLElement>();
const bodyEl = ref<HTMLElement>();
const editorEl = ref<HTMLElement>();

const INITIAL_CLASSES = "is-after is-modified has-java is-diff is-output";
const state = reactive<Record<string, boolean>>(classSet(INITIAL_CLASSES));
const query = ref("");
const typing = ref(false);
const menuPressed = ref(false);
const tokenX = ref(TOKEN_X.start);
const tokenMs = ref(0);
let logId = 0;
const log = ref<{ id: number; label: string; icon: IconName }[]>([]);
const activeStep = ref(REVIEW_BEAT);
const run = reactive({ id: 0, duration: 0 });
const size = reactive({ narrow: false, bodyW: 0, bodyH: 0, editorH: 0 });

function classSet(names: string) {
    return Object.fromEntries(names.split(" ").map((name) => [name, true]));
}

const camera = computed(() => {
    const { narrow, bodyW, bodyH, editorH } = size;
    const sideOpen = !narrow && (state["v-files"] || state["v-scm"] || state["v-deploy"]);
    const editorWidth = bodyW - (narrow ? 0 : ACTIVITY_W) - (sideOpen ? SIDE_W : 0);
    const editorHeight = narrow ? editorH : bodyH - TABS_H - (state["is-output"] ? OUTPUT_H : 0);
    const fitWidth = editorWidth - (!narrow && state["fit-panel"] ? PANEL_W : 0);
    const margin = narrow ? { l: 12, r: 12, t: 44, b: 40 } : { l: 52, r: 12, t: 46, b: 44 };
    // The append menu opens below the task, so the model beat keeps room for it above the lint chip.
    if (!narrow && state["fit-panel"]) margin.b += MODEL_BEAT_LIFT;

    const scale = Math.max(
        0,
        Math.min(
            MAX_SCALE,
            (fitWidth - margin.l - margin.r) / VIEW.w,
            (editorHeight - margin.t - margin.b) / VIEW.h,
        ),
    );
    const left = margin.l + (fitWidth - margin.l - margin.r - VIEW.w * scale) / 2;
    const top = margin.t + (editorHeight - margin.t - margin.b - VIEW.h * scale) / 2;
    const below = {
        left: `${Math.round(Math.min(left + CHARGE_PAYMENT.left * scale, editorWidth - POP_W - 8))}px`,
        top: `${Math.round(top + CHARGE_PAYMENT.bottom * scale + 8)}px`,
    };
    return {
        diagram: {
            left: `${left.toFixed(1)}px`,
            top: `${top.toFixed(1)}px`,
            width: `${(VIEW.w * scale).toFixed(1)}px`,
            height: `${(VIEW.h * scale).toFixed(1)}px`,
        },
        below,
    };
});

const visibleItems = computed(() =>
    MENU_ITEMS.filter((item) => item.label.toLowerCase().includes(query.value)),
);

function menuItemClass(label: string) {
    const active = visibleItems.value[0]?.label === label;
    return { "is-active": active, "is-pressed": active && menuPressed.value };
}

function apply(add: string, remove = "") {
    remove.split(" ").forEach((name) => name && (state[name] = false));
    add.split(" ").forEach((name) => name && (state[name] = true));
}

function type(text: string) {
    query.value = text;
    menuPressed.value = false;
}

function logEntry(label: string, icon: IconName = "logTask") {
    log.value = [...log.value, { id: logId++, label, icon }].slice(-5);
}

function tokenTo(stop: TokenStop) {
    tokenMs.value = Math.abs(TOKEN_X[stop] - tokenX.value) / TOKEN_SPEED_PX_PER_MS;
    tokenX.value = TOKEN_X[stop];
}

interface Beat {
    ms: number;
    base: string;
    steps: [number, () => void][];
}

const BEATS: Beat[] = [
    {
        ms: 3400,
        base: "fit-panel sel-charge",
        steps: [
            [150, () => apply("is-pad pad-append")],
            [
                450,
                () => {
                    apply("is-pop", "is-pad pad-append");
                    typing.value = true;
                },
            ],
            [750, () => type("u")],
            [870, () => type("us")],
            [990, () => type("use")],
            [1110, () => type("user")],
            [1450, () => (menuPressed.value = true)],
            [
                1650,
                () => {
                    typing.value = false;
                    apply("is-after sel-ship is-modified", "is-pop sel-charge");
                },
            ],
            [1950, () => apply("is-panel")],
        ],
    },
    {
        ms: 4100,
        base: "v-files is-after is-modified",
        steps: [
            [250, () => apply("is-sim")],
            [
                550,
                () => {
                    apply("has-token");
                    logEntry("Process started", "logStart");
                },
            ],
            [900, () => tokenTo("charge")],
            [1370, () => logEntry("Charge payment")],
            [1750, () => tokenTo("ship")],
            [2350, () => logEntry("Ship order")],
            [2750, () => tokenTo("end")],
            [3220, () => logEntry("Order shipped", "logEnd")],
        ],
    },
    {
        ms: 3100,
        base: "v-files is-after is-modified",
        steps: [
            [200, () => apply("sel-charge is-pad")],
            [650, () => apply("pad-hover")],
            [1150, () => apply("pad-press")],
            [1350, () => apply("is-code has-java tree-src", "is-pad pad-hover pad-press sel-charge")],
        ],
    },
    {
        ms: 3800,
        base: "v-scm is-after is-modified has-java",
        steps: [
            [450, () => apply("scm-pick")],
            [800, () => apply("is-diff is-output", "v-scm scm-pick")],
        ],
    },
    {
        ms: 2700,
        base: "v-deploy is-after is-modified has-java",
        steps: [
            [600, () => apply("is-deploying is-output")],
            [1250, () => apply("is-deployed", "is-deploying")],
        ],
    },
];

let current = REVIEW_BEAT;
let timers: ReturnType<typeof setTimeout>[] = [];
let reducedMotion = true;
let resizeObserver: ResizeObserver | undefined;
let narrowQuery: MediaQueryList | undefined;

function later(step: () => void, ms: number) {
    timers.push(setTimeout(step, ms));
}

function cancelAll() {
    timers.forEach(clearTimeout);
    timers = [];
}

// Every beat snaps to its start without transitions, so an interrupted beat can never leave two
// states on screen.
async function withoutTransitions(change: () => void) {
    change();
    state["no-anim"] = true;
    await nextTick();
    void ideEl.value?.offsetWidth;
    state["no-anim"] = false;
}

function applyBase(beat: Beat) {
    withoutTransitions(() => {
        Object.keys(state).forEach((name) => (state[name] = false));
        apply(beat.base);
        type("");
        typing.value = false;
        log.value = [];
        tokenX.value = TOKEN_X.start;
        tokenMs.value = 0;
    });
}

function setStep(index: number, duration: number) {
    activeStep.value = index;
    run.duration = duration;
    run.id++;
}

function play(index: number) {
    cancelAll();
    current = index;
    const beat = BEATS[index];
    setStep(index, reducedMotion ? 0 : beat.ms);
    applyBase(beat);
    if (reducedMotion) {
        beat.steps.forEach(([, step]) => step());
        return;
    }
    beat.steps.forEach(([ms, step]) => later(step, ms));
    later(() => play((index + 1) % BEATS.length), beat.ms);
}

// Throttled background timers must not replay late, so a hidden page pauses and a visible one
// restarts its beat cleanly.
function onVisibilityChange() {
    if (document.hidden) cancelAll();
    else play(current);
}

function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) play(current);
}

function measure() {
    size.narrow = narrowQuery?.matches ?? false;
    size.bodyW = bodyEl.value?.clientWidth ?? 0;
    size.bodyH = bodyEl.value?.clientHeight ?? 0;
    size.editorH = editorEl.value?.clientHeight ?? 0;
}

onMounted(() => {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    narrowQuery = window.matchMedia("(max-width: 959px)");
    withoutTransitions(measure);
    resizeObserver = new ResizeObserver(measure);
    if (bodyEl.value) resizeObserver.observe(bodyEl.value);
    if (reducedMotion) return;
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    later(() => play(0), FIRST_LOOP_DELAY_MS);
});

onBeforeUnmount(() => {
    cancelAll();
    resizeObserver?.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pageshow", onPageShow);
});
</script>

<template>
    <div class="showcase">
        <figure
            id="landing-demo"
            class="demo"
            aria-label="Demo: append a user task, simulate a token, jump to the job worker, review the change as a BPMN diff and deploy to Camunda 8"
        >
            <svg width="0" height="0" style="position: absolute" aria-hidden="true">
                <defs>
                    <g id="landing-user" class="shape">
                        <path
                            d="M2 18V15C2 11.5 5 10 10 10C15 10 18 11.5 18 15V18Z"
                            stroke-width="1.2"
                        />
                        <circle cx="10" cy="6" r="3.8" stroke-width="1.2" />
                        <path
                            class="outline"
                            d="M6 18V15M14 18V15"
                            stroke-width="1.2"
                            stroke-linecap="round"
                        />
                    </g>
                    <g id="landing-service" class="shape">
                        <circle
                            class="outline"
                            cx="10"
                            cy="10"
                            r="6.6"
                            stroke-width="3"
                            stroke-dasharray="2.59 2.59"
                        />
                        <circle cx="10" cy="10" r="5.2" stroke-width="1.2" />
                        <circle class="outline" cx="10" cy="10" r="2" stroke-width="1.2" />
                    </g>
                </defs>
            </svg>
            <div ref="ideEl" class="ide" :class="state" aria-hidden="true">
                <div class="ide-title">
                    <span class="ide-dots"><i></i><i></i><i></i></span>
                    <span class="ide-title-text">shop-processes</span>
                </div>
                <div ref="bodyEl" class="ide-body">
                    <div class="ide-activity">
                        <span class="act-files"><Icon name="files" /></span>
                        <span><Icon name="search" /></span>
                        <span class="act-scm"><Icon name="gitBranch" /><i class="badge">2</i></span>
                        <span class="act-deploy"><Icon name="rocket" /></span>
                    </div>

                    <div class="ide-side">
                        <div class="sp sp-files">
                            <div class="side-title">Explorer</div>
                            <div class="ex-tree">
                                <div class="ex-section">
                                    <Icon name="chevronDown" />shop-processes
                                </div>
                                <div class="ex-row" style="--d: 1">
                                    <Icon name="chevronDown" class="chev" /><span class="name"
                                        >.camunda <span class="faded">/</span> element-templates</span
                                    >
                                </div>
                                <div class="ex-row" style="--d: 3">
                                    <span class="gap"></span><Icon name="braces" class="ic" /><span
                                        class="name"
                                        >payment-service.json</span
                                    >
                                </div>
                                <div class="ex-row" style="--d: 3">
                                    <span class="gap"></span><Icon name="braces" class="ic" /><span
                                        class="name"
                                        >shipping-service.json</span
                                    >
                                </div>
                                <div class="ex-row src-closed" style="--d: 1">
                                    <Icon name="chevronRight" class="chev" /><span class="name"
                                        >src</span
                                    >
                                </div>
                                <div class="ex-row src-open" style="--d: 1">
                                    <Icon name="chevronDown" class="chev" /><span class="name"
                                        >src <span class="faded">/</span> main
                                        <span class="faded">/</span> java
                                        <span class="faded">/</span> io
                                        <span class="faded">/</span> miragon</span
                                    >
                                </div>
                                <div class="ex-row ex-java" style="--d: 3">
                                    <span class="gap"></span><Icon name="fileCode" class="ic" /><span
                                        class="name"
                                        >ChargePaymentWorker.java</span
                                    >
                                </div>
                                <div class="ex-row" style="--d: 1">
                                    <span class="gap"></span><Icon name="shieldCheck" class="ic" /><span
                                        class="name"
                                        >.bpmnlintrc</span
                                    >
                                </div>
                                <div class="ex-row" style="--d: 1">
                                    <span class="gap"></span><Icon name="form" class="ic" /><span
                                        class="name"
                                        >ship-order.form</span
                                    >
                                </div>
                                <div class="ex-row" style="--d: 1">
                                    <span class="gap"></span><Icon name="table" class="ic" /><span
                                        class="name"
                                        >discount.dmn</span
                                    >
                                </div>
                                <div class="ex-row ex-bpmn" style="--d: 1">
                                    <span class="gap"></span><img class="ic" :src="bpmnIcon" alt="" /><span
                                        class="name"
                                        >order.bpmn</span
                                    ><span class="ex-m">M</span>
                                </div>
                            </div>
                            <div class="ex-section"><Icon name="chevronRight" />Outline</div>
                            <div class="ex-section"><Icon name="chevronRight" />Timeline</div>
                        </div>

                        <div class="sp sp-scm">
                            <div class="side-title">Source Control</div>
                            <div class="scm">
                                <div class="scm-msg">Add shipping step</div>
                                <span class="scm-btn"><Icon name="check" />Commit</span>
                            </div>
                            <div class="ex-section">
                                <Icon name="chevronDown" />Changes<span class="count">2</span>
                            </div>
                            <div class="ex-row scm-row ex-bpmn" style="--d: 2">
                                <img class="ic" :src="bpmnIcon" alt="" /><span class="name"
                                    >order.bpmn</span
                                ><span class="st">M</span>
                            </div>
                            <div class="ex-row scm-row" style="--d: 2">
                                <Icon name="form" class="ic" /><span class="name">ship-order.form</span
                                ><span class="st">U</span>
                            </div>
                        </div>

                        <div class="sp sp-deploy">
                            <div class="side-title">Deployment</div>
                            <div class="dp">
                                <label>Target</label>
                                <div class="dp-field">dev<Icon name="chevronDown" /></div>
                                <label>REST Endpoint</label>
                                <div class="dp-field"><code>http://localhost:8080</code></div>
                                <label>Engine</label>
                                <div class="dp-field">Camunda Cloud 8<Icon name="chevronDown" /></div>
                                <div class="dp-tabs">
                                    <span class="on">Deploy</span><span>Start Instance</span>
                                </div>
                                <label>Deployment Name</label>
                                <div class="dp-field">order</div>
                                <label>Main File</label>
                                <div class="dp-field">order.bpmn</div>
                                <div class="dp-extra">Include additional files<span>+</span></div>
                                <span class="dp-btn">Deploy</span>
                            </div>
                        </div>
                    </div>

                    <div class="ide-main">
                        <div class="ide-tabs">
                            <div class="ide-tab tab-bpmn">
                                <img :src="bpmnIcon" alt="" />order.bpmn<span class="mod">M</span
                                ><Icon name="close" class="x" />
                            </div>
                            <div class="ide-tab tab-java">
                                <Icon name="fileCode" class="ic" />ChargePaymentWorker.java
                            </div>
                            <div class="ide-tab tab-diff">
                                <img :src="bpmnIcon" alt="" />order.bpmn (HEAD ↔ Working Tree)
                            </div>
                        </div>
                        <div ref="editorEl" class="ide-editor">
                            <div class="canvas">
                                <div class="diagram" :style="camera.diagram">
                                    <svg
                                        class="bpmn"
                                        viewBox="0 0 464 100"
                                        font-family="Arial, Arimo, sans-serif"
                                        font-size="12"
                                        text-anchor="middle"
                                    >
                                        <g>
                                            <path class="flow" d="M66 56H110" stroke-width="1.5" />
                                            <path d="M99 60L110 56L99 52Z" />
                                        </g>
                                        <g>
                                            <path class="flow" d="M210 56H254" stroke-width="1.5" />
                                            <path d="M243 60L254 56L243 52Z" />
                                        </g>
                                        <g class="d-added">
                                            <path class="flow" d="M354 56H398" stroke-width="1.5" />
                                            <path d="M387 60L398 56L387 52Z" />
                                        </g>
                                        <g>
                                            <circle class="shape" cx="48" cy="56" r="18" stroke-width="2" />
                                            <text x="48" y="92">Order received</text>
                                        </g>
                                        <g>
                                            <rect
                                                class="shape"
                                                x="110"
                                                y="16"
                                                width="100"
                                                height="80"
                                                rx="10"
                                                stroke-width="2"
                                            />
                                            <use href="#landing-service" x="114" y="20" />
                                            <text x="160" y="52.4">Charge</text>
                                            <text x="160" y="66.8">payment</text>
                                        </g>
                                        <g class="d-added">
                                            <rect
                                                class="shape"
                                                x="254"
                                                y="16"
                                                width="100"
                                                height="80"
                                                rx="10"
                                                stroke-width="2"
                                            />
                                            <use href="#landing-user" x="258" y="20" />
                                            <text x="304" y="59.6">Ship order</text>
                                        </g>
                                        <g class="d-moved">
                                            <circle
                                                class="shape"
                                                cx="416"
                                                cy="56"
                                                r="18"
                                                stroke-width="4"
                                            />
                                            <text x="416" y="92">Order shipped</text>
                                        </g>
                                        <rect
                                            class="sel"
                                            x="104"
                                            y="10"
                                            width="112"
                                            height="92"
                                            rx="14"
                                            stroke-width="1.5"
                                        />
                                        <g class="start-play" transform="translate(18 18)">
                                            <rect width="16" height="16" rx="3" />
                                            <path d="M5.5 4L12 8L5.5 12Z" />
                                        </g>
                                        <g
                                            class="token"
                                            :style="{ '--tx': `${tokenX}px`, '--tms': `${tokenMs}ms` }"
                                        >
                                            <circle r="8" />
                                            <text y="3.6" font-size="10" font-weight="700">1</text>
                                        </g>
                                    </svg>
                                </div>

                                <div class="cpad" :style="camera.below">
                                    <span class="append"><Icon name="task" /></span>
                                    <span><Icon name="gateway" /></span>
                                    <span><Icon name="endEvent" /></span>
                                    <span><Icon name="wrench" /></span>
                                    <span><Icon name="trash" /></span>
                                    <span><Icon name="arrowUpRight" /></span>
                                    <span class="goto"
                                        ><Icon name="code" /><em class="cpad-tip"
                                            >Go to implementation</em
                                        ></span
                                    >
                                </div>

                                <div class="pop" :style="camera.below">
                                    <div class="pop-search" :class="{ 'is-typing': typing }">
                                        <Icon name="searchBold" />
                                        <span class="pop-query">{{ query }}</span
                                        ><span class="caret"></span>
                                    </div>
                                    <ul class="pop-list">
                                        <li
                                            v-for="item in MENU_ITEMS"
                                            v-show="visibleItems.includes(item)"
                                            :key="item.label"
                                            :class="menuItemClass(item.label)"
                                        >
                                            <Icon :name="item.icon" />
                                            <template v-if="item.template">
                                                <b>{{ item.label }}</b
                                                ><span class="tpl-tag">Template</span>
                                            </template>
                                            <template v-else>{{ item.label }}</template>
                                        </li>
                                    </ul>
                                </div>

                                <div class="tl">
                                    <span class="chip sim-toggle"
                                        >Token Simulation
                                        <Icon name="toggleOff" class="off" />
                                        <Icon name="toggleOn" class="on" />
                                    </span>
                                    <span class="chip mode-chip"
                                        >Implement<Icon name="chevronDown"
                                    /></span>
                                </div>
                                <div class="tr">
                                    <span class="chip minimap-btn">Open minimap</span>
                                    <span class="focus-btn"><Icon name="focus" /></span>
                                </div>

                                <div class="palette">
                                    <span><Icon name="hand" /></span>
                                    <span><Icon name="lasso" /></span>
                                    <span><Icon name="arrowUpRight" /></span>
                                    <hr />
                                    <span><Icon name="startEvent" /></span>
                                    <span><Icon name="gateway" /></span>
                                    <span><Icon name="task" /></span>
                                </div>
                                <div class="sim-palette">
                                    <span><Icon name="pause" /></span>
                                    <span><Icon name="restart" /></span>
                                    <span><Icon name="logList" /></span>
                                </div>

                                <ul class="log">
                                    <li v-for="entry in log" :key="entry.id">
                                        <Icon :name="entry.icon" /><span>{{ entry.label }}</span
                                        ><code>k3x9p1</code>
                                    </li>
                                </ul>

                                <div class="bottom-centre">
                                    <span class="chip lint"
                                        ><Icon name="check" />0 Errors, 0 Warnings</span
                                    >
                                    <span class="chip speed">
                                        <span><Icon name="gauge" /></span>
                                        <span><Icon name="chevronRight" /></span>
                                        <span class="on"><Icon name="chevronsRight" /></span>
                                        <span><Icon name="chevronsRight3" /></span>
                                    </span>
                                </div>
                            </div>

                            <div class="code-view">
                                <div class="code-crumbs">
                                    src › main › java › io › miragon › shop › ChargePaymentWorker.java
                                </div>
                                <ol class="code-lines">
                                    <li
                                        v-for="(line, index) in JAVA_LINES"
                                        :key="index"
                                        :class="{ hit: index === JOB_WORKER_LINE }"
                                    >
                                        <span
                                            v-for="([kind, text], part) in line"
                                            :key="part"
                                            :class="kind"
                                            >{{ text }}</span
                                        >
                                    </li>
                                </ol>
                            </div>

                            <!-- The modeler's own diff colours (bpmn-js-differ), so the mock matches the real diff view. -->
                            <!-- brand-lint-disable -->
                            <div class="diff-view">
                                <div class="panes">
                                    <div class="pane pane-before">
                                        <span class="pane-title">HEAD</span>
                                        <svg
                                            class="bpmn-diff"
                                            viewBox="-4 8 278 94"
                                            font-family="Arial, Arimo, sans-serif"
                                            font-size="12"
                                            text-anchor="middle"
                                        >
                                            <path class="flow" d="M59 56H75" stroke-width="1.5" />
                                            <path d="M75 60L86 56L75 52Z" />
                                            <path class="flow" d="M186 56H201" stroke-width="3" />
                                            <path d="M201 60L212 56L201 52Z" />
                                            <circle class="shape" cx="41" cy="56" r="18" stroke-width="2" />
                                            <rect
                                                class="shape"
                                                x="86"
                                                y="16"
                                                width="100"
                                                height="80"
                                                rx="10"
                                                stroke-width="2"
                                            />
                                            <use href="#landing-service" x="90" y="20" />
                                            <circle
                                                class="shape"
                                                cx="230"
                                                cy="56"
                                                r="18"
                                                stroke-width="4"
                                                stroke-dasharray="7 4.5"
                                            />
                                            <text x="41" y="92">Order received</text>
                                            <text x="136" y="52.4">Charge</text>
                                            <text x="136" y="66.8">payment</text>
                                            <text x="230" y="92">Order shipped</text>
                                        </svg>
                                    </div>
                                    <div class="pane pane-after">
                                        <span class="pane-title">Working Tree</span>
                                        <svg
                                            class="bpmn-diff"
                                            viewBox="-4 8 402 94"
                                            font-family="Arial, Arimo, sans-serif"
                                            font-size="12"
                                            text-anchor="middle"
                                        >
                                            <path class="flow" d="M59 56H75" stroke-width="1.5" />
                                            <path d="M75 60L86 56L75 52Z" />
                                            <path class="flow" d="M186 56H201" stroke-width="3" />
                                            <path d="M201 60L212 56L201 52Z" />
                                            <path class="flow added" d="M312 56H326" stroke-width="3" />
                                            <path class="added-fill" d="M326 60L337 56L326 52Z" />
                                            <circle class="shape" cx="41" cy="56" r="18" stroke-width="2" />
                                            <rect
                                                class="shape"
                                                x="86"
                                                y="16"
                                                width="100"
                                                height="80"
                                                rx="10"
                                                stroke-width="2"
                                            />
                                            <use href="#landing-service" x="90" y="20" />
                                            <rect
                                                class="shape added"
                                                x="212"
                                                y="16"
                                                width="100"
                                                height="80"
                                                rx="10"
                                                stroke-width="4"
                                            />
                                            <use href="#landing-user" x="216" y="20" />
                                            <circle
                                                class="shape"
                                                cx="355"
                                                cy="56"
                                                r="18"
                                                stroke-width="4"
                                                stroke-dasharray="7 4.5"
                                            />
                                            <text x="41" y="92">Order received</text>
                                            <text x="136" y="52.4">Charge</text>
                                            <text x="136" y="66.8">payment</text>
                                            <text x="262" y="59.6">Ship order</text>
                                            <text x="355" y="92">Order shipped</text>
                                        </svg>
                                    </div>
                                </div>
                                <div class="legend">
                                    <span><i class="sw sw-add"></i>Added 2</span
                                    ><span><i class="sw sw-chg"></i>Changed 1</span
                                    ><span><i class="sw sw-mov"></i>Moved 1</span>
                                </div>
                            </div>
                            <!-- brand-lint-enable -->

                            <span class="panel-handle"><Icon name="chevronLeft" /></span>
                            <aside class="panel">
                                <div class="panel-head">
                                    <Icon name="userTask" />
                                    <div><b>Ship order</b><small>User task</small></div>
                                </div>
                                <div class="group">
                                    <div class="group-head">General<Icon name="chevronRight" /></div>
                                </div>
                                <div class="group">
                                    <div class="group-head">Form<Icon name="chevronDown" /></div>
                                    <div class="group-body">
                                        <div class="field">
                                            <label>Type</label>
                                            <div class="input">
                                                Camunda Form (linked)<Icon name="chevronDown" />
                                            </div>
                                        </div>
                                        <div class="field">
                                            <label>Form ID</label>
                                            <div class="input mono">ship-order</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="group">
                                    <div class="group-head">Assignment<Icon name="chevronDown" /></div>
                                    <div class="group-body">
                                        <div class="field">
                                            <label>Candidate groups</label>
                                            <div class="input mono">warehouse</div>
                                        </div>
                                    </div>
                                </div>
                                <div class="group">
                                    <div class="group-head">Inputs<Icon name="chevronRight" /></div>
                                </div>
                                <div class="group">
                                    <div class="group-head">Outputs<Icon name="chevronRight" /></div>
                                </div>
                            </aside>
                        </div>
                        <div class="output">
                            <div class="out-head">
                                <span>Problems</span><span class="oh-out">Output</span
                                ><span class="oh-term">Terminal</span
                                ><span class="channel">Miragon BPMN Modeler</span>
                            </div>
                            <ol class="out-lines out-git">
                                <li v-for="([dim, text], index) in GIT_LINES" :key="index">
                                    <span class="t">{{ dim }}</span
                                    >{{ text }}
                                </li>
                            </ol>
                            <ol class="out-lines out-deploy">
                                <li
                                    v-for="([dim, text], index) in DEPLOY_LINES"
                                    :key="index"
                                    :class="{ l1: index === 0 }"
                                >
                                    <span class="t">{{ dim }}</span
                                    >{{ text }}
                                </li>
                            </ol>
                        </div>
                    </div>
                </div>
                <div class="ide-status">
                    <span><Icon name="gitBranchBold" />main*</span>
                    <span class="st-problems"
                        ><Icon name="error" />0<Icon name="warning" />0</span
                    >
                    <span class="spacer"></span>
                    <span class="st-code">Ln 6, Col 5</span><span class="st-code">Java</span>
                    <span class="st-target"><i class="dot"></i>dev · Camunda 8</span>
                    <span class="st-done"
                        ><i class="dot"></i>Deployed order.bpmn to Camunda 8 · instance started</span
                    >
                </div>
            </div>
        </figure>

        <ol class="loop" aria-label="Demo steps">
            <li
                v-for="(step, index) in STEPS"
                :key="step.name"
                class="loop-step"
                :class="{
                    'is-done': index < activeStep,
                    'is-active': index === activeStep,
                    'is-running': index === activeStep && run.duration > 0,
                }"
                @click="play(index)"
            >
                <span class="track"
                    ><span
                        :key="index === activeStep ? run.id : -1"
                        class="fill"
                        :style="{ '--dur': `${run.duration}ms` }"
                        aria-hidden="true"
                    ></span
                    ><button
                        class="node"
                        type="button"
                        aria-controls="landing-demo"
                        :aria-label="`Show ${step.name} in the demo`"
                        :aria-current="index === activeStep ? 'step' : undefined"
                    >
                        0{{ index + 1 }}
                    </button></span
                >
                <h2>{{ step.name }}</h2>
                <p>{{ step.text }}</p>
            </li>
        </ol>
    </div>
</template>

<style scoped>
.showcase {
    display: contents;
}
.demo {
    grid-area: 1 / 2;
    z-index: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    margin: 0;
    border: 1px solid var(--cd-ui-linie);
    border-radius: var(--cd-radius-md);
    overflow: hidden;
    background: var(--cd-ui-abschnitt);
    box-shadow: var(--cd-shadow-2);
}
code {
    font-family: var(--vp-font-family-mono);
}

/* Loop rail: as wide as the window; a step plays its beat, its title opens the docs. */
.loop {
    --gap: 16px;
    grid-area: 2 / 2;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    column-gap: var(--gap);
    margin: 0;
    padding: 0;
    list-style: none;
}
.loop-step {
    position: relative;
    min-width: 0;
    cursor: pointer;
}
.track {
    position: relative;
    display: flex;
    align-items: center;
    height: 28px;
}
.track::before,
.fill {
    content: "";
    position: absolute;
    top: 50%;
    right: calc(-1 * var(--gap));
    left: 0;
    height: 1px;
    background: var(--cd-ui-linie);
}
.loop-step:last-child .track::before,
.loop-step:last-child .fill {
    right: 0;
}
.fill {
    height: 2px;
    margin-top: -1px;
    background: var(--cd-ui-interaktion);
    transform: scaleX(0);
    transform-origin: left center;
}
.loop-step.is-running .fill {
    animation: fill var(--dur, 3000ms) linear forwards;
}
@keyframes fill {
    from {
        transform: scaleX(0);
    }
    to {
        transform: none;
    }
}
.node {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--cd-ui-linie);
    border-radius: 4px;
    background: var(--cd-ui-seite);
    color: var(--cd-ui-text-leise);
    font: 500 12px/1 var(--vp-font-family-mono);
    cursor: pointer;
    transition:
        border-color 250ms var(--cd-ease),
        background-color 250ms var(--cd-ease),
        color 250ms var(--cd-ease);
}
.loop-step.is-active .node {
    border-color: var(--cd-ui-interaktion);
    background: var(--cd-ui-interaktion);
    color: var(--cd-weiss);
}
:global(.dark .showcase .loop-step.is-active .node) {
    color: var(--cd-schwarz);
}
.loop-step h2 {
    margin: 6px 0 2px;
    padding: 0;
    border: 0;
    font-size: 16px;
    line-height: 1.3;
    font-weight: 600;
    letter-spacing: normal;
    color: var(--cd-ui-text);
    transition: color 250ms var(--cd-ease);
}
.loop-step.is-done h2 {
    color: var(--cd-ui-text-leise);
}
.loop-step p {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    color: var(--cd-ui-text-leise);
}

/* IDE */
.ide {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    font-size: 12px;
    line-height: 1.4;
}
.ide-title {
    flex: none;
    height: 30px;
    display: flex;
    align-items: center;
    position: relative;
    padding: 0 12px;
    border-bottom: 1px solid var(--cd-ui-linie);
    color: var(--cd-ui-text-leise);
}
.ide-dots {
    display: flex;
    gap: 7px;
}
.ide-dots i {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--cd-ui-linie);
    display: block;
}
.ide-title-text {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    pointer-events: none;
}
.ide-body {
    flex: 1;
    min-height: 0;
    display: flex;
}
.ide-activity {
    flex: none;
    width: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-top: 6px;
    border-right: 1px solid var(--cd-ui-linie);
    color: var(--cd-ui-text-leise);
}
.ide-activity span {
    width: 40px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: color 200ms var(--cd-ease);
}
.ide-activity svg {
    width: 18px;
    height: 18px;
}
.ide-activity span::before {
    content: "";
    position: absolute;
    left: 0;
    top: 7px;
    bottom: 7px;
    width: 2px;
    background: transparent;
    transition: background-color 200ms var(--cd-ease);
}
.ide-activity .badge {
    position: absolute;
    right: 5px;
    bottom: 5px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--cd-ui-linie);
    color: var(--cd-ui-text);
    font-size: 9px;
    font-weight: 600;
    font-style: normal;
    line-height: 14px;
    text-align: center;
    opacity: 0;
    transition: opacity 200ms var(--cd-ease);
}
.ide.is-modified .ide-activity .badge {
    opacity: 1;
}
.v-files .act-files,
.v-scm .act-scm,
.v-deploy .act-deploy {
    color: var(--cd-ui-text);
}
.v-files .act-files::before,
.v-scm .act-scm::before,
.v-deploy .act-deploy::before {
    background: var(--cd-ui-text);
}

.ide-side {
    flex: none;
    width: 0;
    position: relative;
    overflow: hidden;
    border-right: 0 solid var(--cd-ui-linie);
    transition: width 350ms var(--cd-ease);
}
.v-files .ide-side,
.v-scm .ide-side,
.v-deploy .ide-side {
    width: 185px;
    border-right-width: 1px;
}
.sp {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 184px;
    display: flex;
    flex-direction: column;
    opacity: 0;
    visibility: hidden;
    transition:
        opacity 200ms var(--cd-ease),
        visibility 0s linear 200ms;
}
.v-files .sp-files,
.v-scm .sp-scm,
.v-deploy .sp-deploy {
    opacity: 1;
    visibility: visible;
    transition: opacity 200ms var(--cd-ease);
}
.side-title {
    flex: none;
    height: 34px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--cd-ui-text-leise);
}
.ex-section {
    flex: none;
    height: 22px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 2px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--cd-ui-text);
}
.ex-tree + .ex-section,
.ex-section + .ex-section {
    border-top: 1px solid var(--cd-ui-linie);
}
.ex-section svg,
.ex-row .chev {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--cd-ui-text-leise);
}
.ex-section .count {
    margin-left: auto;
    margin-right: 10px;
    min-width: 16px;
    height: 16px;
    border-radius: var(--cd-radius-pill);
    background: var(--cd-ui-linie);
    color: var(--cd-ui-text);
    font-size: 10px;
    letter-spacing: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
}
.ex-tree {
    flex: 1;
}
.ex-row {
    height: 22px;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px 0 calc(4px + var(--d, 1) * 8px);
    color: var(--cd-ui-text);
    white-space: nowrap;
    transition: background-color 150ms var(--cd-ease);
}
.ex-row .ic {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--cd-ui-text-leise);
}
.ex-row .gap {
    width: 14px;
    flex: none;
}
.ex-row .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}
.ex-row .faded {
    color: var(--cd-ui-text-leise);
}
.ex-m {
    color: var(--cd-ui-text-leise);
    font-weight: 600;
    display: none;
}
.is-modified .ex-m {
    display: inline;
}
.ex-bpmn {
    background: var(--cd-ui-linie);
}
.ex-row img.ic {
    filter: grayscale(1);
    opacity: 0.7;
}
.ex-java,
.src-open {
    display: none;
}
.tree-src .ex-java,
.tree-src .src-open {
    display: flex;
}
.tree-src .src-closed {
    display: none;
}
.tree-src .ex-bpmn {
    background: transparent;
}
.tree-src .ex-java {
    background: var(--cd-ui-linie);
}

.scm {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.scm-msg,
.dp-field {
    height: 26px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    gap: 6px;
    background: var(--cd-ui-seite);
    border: 1px solid var(--cd-ui-kontur);
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
}
.scm-btn,
.dp-btn {
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-radius: 4px;
    background: var(--cd-blau);
    color: var(--cd-weiss);
    font-weight: 600;
    transition: background-color 150ms var(--cd-ease);
}
.scm-btn {
    background: var(--cd-ui-linie);
    color: var(--cd-ui-text);
}
.scm-btn svg {
    width: 13px;
    height: 13px;
    flex: none;
}
.sp-scm .ex-section {
    margin-top: 4px;
}
.scm-row .st {
    margin-left: auto;
    font-weight: 600;
    color: var(--cd-ui-text-leise);
}
.scm-row.ex-bpmn {
    background: transparent;
}
.scm-pick .scm-row.ex-bpmn {
    background: var(--cd-ui-linie);
}

.dp {
    padding: 0 12px 12px;
    display: flex;
    flex-direction: column;
}
.dp label {
    font-size: 11px;
    color: var(--cd-ui-text-leise);
    margin: 0 0 3px;
}
.dp-field + label {
    margin-top: 9px;
}
.dp-field svg {
    width: 12px;
    height: 12px;
    margin-left: auto;
    color: var(--cd-ui-text-leise);
    flex: none;
}
.dp-field code {
    font-size: 11px;
}
.dp-tabs {
    display: flex;
    gap: 14px;
    margin: 14px 0 10px;
    border-bottom: 1px solid var(--cd-ui-linie);
    color: var(--cd-ui-text-leise);
}
.dp-tabs span {
    padding-bottom: 5px;
}
.dp-tabs .on {
    color: var(--cd-ui-text);
    box-shadow: inset 0 -1px 0 var(--cd-ui-text);
}
.dp-btn {
    margin-top: 10px;
}
.dp-extra {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
    font-size: 11px;
    color: var(--cd-ui-text-leise);
}
.dp-extra span {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--cd-ui-kontur);
    border-radius: 4px;
    color: var(--cd-ui-text);
    font-size: 13px;
}
.is-deploying .dp-btn {
    background: var(--cd-blau-link);
    box-shadow: inset 0 0 0 2px var(--cd-blau-hell);
}

.ide-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--cd-ui-seite);
}
.ide-tabs {
    flex: none;
    height: 34px;
    display: flex;
    border-bottom: 1px solid var(--cd-ui-linie);
    background: var(--cd-ui-abschnitt);
    overflow: hidden;
}
.ide-tab {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border-right: 1px solid var(--cd-ui-linie);
    color: var(--cd-ui-text-leise);
    margin-bottom: -1px;
    white-space: nowrap;
    transition:
        background-color 150ms var(--cd-ease),
        color 150ms var(--cd-ease);
}
.ide-tab img,
.ide-tab .ic {
    width: 14px;
    height: 14px;
    flex: none;
}
.ide-tab .x {
    width: 13px;
    height: 13px;
    color: var(--cd-ui-text-leise);
}
.ide-tab .mod {
    color: var(--cd-ui-text-leise);
    font-weight: 600;
    display: none;
}
.is-modified .tab-bpmn .mod {
    display: inline;
}
.tab-bpmn {
    background: var(--cd-ui-seite);
    color: var(--cd-ui-text);
}
.is-code .tab-bpmn,
.is-diff .tab-bpmn {
    background: transparent;
    color: var(--cd-ui-text-leise);
}
.is-code .tab-bpmn img,
.is-diff .tab-bpmn img {
    filter: grayscale(1);
    opacity: 0.7;
}
.tab-java,
.tab-diff {
    display: none;
}
.has-java .tab-java,
.is-diff .tab-diff {
    display: flex;
}
.is-code .tab-java,
.is-diff .tab-diff {
    background: var(--cd-ui-seite);
    color: var(--cd-ui-text);
}

.ide-editor {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
    background: var(--cd-ui-seite);
}
.canvas {
    position: absolute;
    inset: 0;
    transition: opacity 200ms var(--cd-ease);
}
.canvas::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 6;
    box-shadow: inset 0 0 0 2px var(--cd-ui-kontur);
    opacity: 0;
    transition: opacity 250ms var(--cd-ease);
}
.is-sim .canvas::after {
    opacity: 1;
}
.is-code .canvas,
.is-diff .canvas {
    visibility: hidden;
    transition: none;
}

.chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 8px;
    background: var(--cd-ui-abschnitt);
    border: 1px solid var(--cd-ui-linie);
    border-radius: 4px;
    color: var(--cd-ui-text);
    font-size: 12px;
    white-space: nowrap;
    transition:
        background-color 250ms var(--cd-ease),
        color 250ms var(--cd-ease),
        border-color 250ms var(--cd-ease),
        opacity 200ms var(--cd-ease);
}
.chip svg {
    width: 18px;
    height: 18px;
}
.tl {
    position: absolute;
    top: 10px;
    left: 12px;
    display: flex;
    gap: 6px;
    z-index: 5;
}
.sim-toggle .on {
    display: none;
}
.is-sim .sim-toggle {
    border-color: var(--cd-ui-kontur);
}
.is-sim .sim-toggle .on {
    display: block;
}
.is-sim .sim-toggle .off {
    display: none;
}
.mode-chip svg {
    width: 13px;
    height: 13px;
}
.tr {
    position: absolute;
    top: 10px;
    right: 26px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 5;
}
.minimap-btn {
    background: var(--cd-ui-flaeche-hoch);
    box-shadow: var(--cd-shadow-1);
}
.fit-panel .minimap-btn,
.is-panel .minimap-btn,
.v-files .minimap-btn,
.v-scm .minimap-btn,
.v-deploy .minimap-btn {
    opacity: 0;
}
.focus-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cd-ui-kontur);
}
.focus-btn svg {
    width: 20px;
    height: 20px;
}

.palette,
.sim-palette {
    position: absolute;
    left: 12px;
    top: 46px;
    width: 32px;
    z-index: 5;
    background: var(--cd-ui-abschnitt);
    border: 1px solid var(--cd-ui-linie);
    border-radius: 4px;
    padding: 3px 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--cd-ui-text);
    transition: opacity 200ms var(--cd-ease);
}
.palette span,
.sim-palette span {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.palette svg,
.sim-palette svg {
    width: 16px;
    height: 16px;
}
.palette hr {
    width: 18px;
    height: 0;
    border: 0;
    border-top: 1px solid var(--cd-ui-linie);
    margin: 3px 0;
}
.sim-palette {
    background: transparent;
    border: 0;
    gap: 4px;
    opacity: 0;
}
.sim-palette span {
    background: var(--cd-ui-abschnitt);
    border: 1px solid var(--cd-ui-linie);
    border-radius: 4px;
}
.is-sim .palette {
    opacity: 0;
}
.is-sim .sim-palette {
    opacity: 1;
}

.bottom-centre {
    position: absolute;
    left: 50%;
    bottom: 12px;
    transform: translateX(-50%);
    z-index: 5;
    display: grid;
}
.bottom-centre > * {
    grid-area: 1 / 1;
    justify-self: center;
}
.lint svg {
    width: 14px;
    height: 14px;
}
.speed {
    gap: 0;
    opacity: 0;
    padding: 0;
    overflow: hidden;
}
.speed span {
    width: 26px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.speed span.on {
    background: var(--cd-ui-linie);
}
.speed svg {
    width: 14px;
    height: 14px;
}
.is-sim .lint {
    opacity: 0;
}
.is-sim .speed {
    opacity: 1;
}

.log {
    position: absolute;
    left: 12px;
    bottom: 12px;
    width: 172px;
    z-index: 5;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    transition: opacity 200ms var(--cd-ease);
}
.is-sim .log {
    opacity: 1;
}
.log li {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 4px 0 6px;
    background: var(--cd-ui-abschnitt);
    color: var(--cd-ui-text);
    font-size: 12px;
    border-radius: 4px;
}
.log li svg {
    width: 12px;
    height: 12px;
    flex: none;
}
.log li span {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.log li code {
    font-size: 11px;
    color: var(--cd-ui-text-leise);
}

/* The diagram is sized and placed by the camera; shapes follow the page mode by role. */
.diagram {
    position: absolute;
    transition:
        left 450ms var(--cd-ease),
        top 450ms var(--cd-ease),
        width 450ms var(--cd-ease),
        height 450ms var(--cd-ease);
}
.bpmn {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
}
.bpmn,
.bpmn-diff {
    fill: var(--cd-ui-text);
    stroke: var(--cd-ui-text);
}
.bpmn text,
.bpmn-diff text {
    stroke: none;
}
.shape {
    fill: var(--cd-ui-plot);
}
.outline,
.flow {
    fill: none;
}
.bpmn .d-added,
.bpmn .d-moved {
    transition:
        opacity 400ms var(--cd-ease),
        transform 400ms var(--cd-ease);
}
.ide:not(.is-after) .canvas .d-added {
    opacity: 0;
}
.ide:not(.is-after) .canvas .d-moved {
    transform: translateX(-144px);
}
.bpmn .sel {
    fill: none;
    stroke: var(--cd-ui-interaktion);
    opacity: 0;
    transition:
        transform 300ms var(--cd-ease),
        opacity 200ms var(--cd-ease);
}
.sel-charge .canvas .sel,
.sel-ship .canvas .sel {
    opacity: 1;
}
.sel-ship .canvas .sel {
    transform: translateX(144px);
}
.bpmn .start-play {
    stroke: none;
    opacity: 0;
    transition: opacity 200ms var(--cd-ease);
}
.start-play rect {
    fill: var(--cd-kontur);
}
.start-play path {
    fill: var(--cd-ui-plot);
}
.is-sim .canvas .start-play {
    opacity: 1;
}
.bpmn .token {
    stroke: none;
    opacity: 0;
    transform: translate(var(--tx, 48px), 56px);
    transition:
        transform var(--tms, 0ms) ease-in-out,
        opacity 150ms var(--cd-ease);
}
.token circle {
    fill: var(--cd-gruen);
}
.token text {
    fill: var(--cd-schwarz);
}
.has-token .canvas .token {
    opacity: 1;
}

/* Context pad with the code-link entry */
.cpad {
    position: absolute;
    z-index: 7;
    display: grid;
    grid-template-columns: repeat(3, 24px);
    gap: 2px;
    padding: 4px;
    background: var(--cd-ui-flaeche-hoch);
    border: 1px solid var(--cd-ui-linie);
    border-radius: 6px;
    box-shadow: var(--cd-shadow-1);
    color: var(--cd-ui-text);
    opacity: 0;
    transition: opacity 180ms var(--cd-ease);
    pointer-events: none;
}
.is-pad .cpad {
    opacity: 1;
}
.cpad span {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    position: relative;
}
.cpad svg {
    width: 16px;
    height: 16px;
}
.pad-append .cpad .append,
.pad-hover .cpad .goto {
    background: var(--cd-ui-abschnitt);
    box-shadow: inset 0 0 0 1px var(--cd-ui-linie);
}
.pad-press .cpad .goto {
    background: var(--cd-ui-linie);
}
.cpad-tip {
    position: absolute;
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    padding: 3px 7px;
    border-radius: 4px;
    background: var(--cd-ui-text);
    color: var(--cd-ui-seite);
    font-size: 12px;
    font-style: normal;
    opacity: 0;
    transition: opacity 150ms var(--cd-ease);
}
.pad-hover .cpad-tip {
    opacity: 1;
}

/* Append menu with element templates */
.pop {
    position: absolute;
    width: 228px;
    z-index: 7;
    color: var(--cd-ui-text);
    background: var(--cd-ui-flaeche-hoch);
    border: 1px solid var(--cd-ui-linie);
    border-radius: 6px;
    box-shadow: var(--cd-shadow-2);
    padding: 6px;
    opacity: 0;
    transform: translateY(4px) scale(0.98);
    transform-origin: top left;
    transition:
        opacity 180ms var(--cd-ease),
        transform 180ms var(--cd-ease);
    pointer-events: none;
}
.is-pop .pop {
    opacity: 1;
    transform: none;
}
.pop-search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--cd-ui-kontur);
    border-radius: 4px;
}
.pop-search svg {
    width: 13px;
    height: 13px;
    color: var(--cd-ui-text-leise);
    flex: none;
}
.pop-query:empty::before {
    content: "Search";
    color: var(--cd-ui-text-leise);
}
.pop-list {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
}
.pop-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 8px;
    border-radius: 4px;
    white-space: nowrap;
}
.pop-list li.is-active {
    background: var(--cd-ui-abschnitt);
}
.pop-list li.is-pressed {
    background: var(--cd-ui-linie);
}
.pop-list svg {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--cd-ui-text);
}
.pop-list .tpl-tag {
    margin-left: auto;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: var(--cd-radius-pill);
    background: var(--cd-ui-abschnitt);
    border: 1px solid var(--cd-ui-linie);
    color: var(--cd-ui-text-leise);
}
.pop-list b {
    font-weight: 600;
}
.caret {
    display: inline-block;
    width: 1px;
    height: 13px;
    background: currentColor;
    margin-left: 1px;
    vertical-align: -2px;
    visibility: hidden;
}
.is-typing .caret {
    visibility: visible;
    animation: blink 1s steps(1) infinite;
}
@keyframes blink {
    50% {
        opacity: 0;
    }
}

/* Properties panel */
.panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 200px;
    z-index: 8;
    background: var(--cd-ui-flaeche);
    border-left: 1px solid var(--cd-ui-linie);
    color: var(--cd-ui-text);
    transform: translateX(100%);
    transition: transform 400ms var(--cd-ease);
    overflow: hidden;
}
.is-panel .panel {
    transform: none;
}
.panel-handle {
    position: absolute;
    top: 50%;
    right: 0;
    width: 16px;
    height: 36px;
    margin-top: -18px;
    z-index: 9;
    background: var(--cd-ui-flaeche);
    border: 1px solid var(--cd-ui-linie);
    border-right: 0;
    border-radius: 4px 0 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cd-ui-text-leise);
    transition:
        right 400ms var(--cd-ease),
        opacity 200ms var(--cd-ease);
}
.panel-handle svg {
    width: 12px;
    height: 12px;
    transition: transform 400ms var(--cd-ease);
}
.is-panel .panel-handle {
    right: 200px;
}
.is-panel .panel-handle svg {
    transform: rotate(180deg);
}
.is-code .panel-handle,
.is-diff .panel-handle {
    opacity: 0;
}
.panel-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--cd-ui-linie);
}
.panel-head svg {
    width: 22px;
    height: 22px;
    flex: none;
}
.panel-head b {
    display: block;
    font-size: 13px;
    font-weight: 600;
}
.panel-head small {
    display: block;
    font-size: 11px;
    color: var(--cd-ui-text-leise);
}
.group {
    border-bottom: 1px solid var(--cd-ui-linie);
}
.group-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 30px;
    padding: 0 12px;
    font-weight: 500;
}
.group-head svg {
    width: 14px;
    height: 14px;
    color: var(--cd-ui-text-leise);
}
.group-body {
    padding: 0 12px 10px;
}
.field + .field {
    margin-top: 8px;
}
.field label {
    display: block;
    font-size: 11px;
    color: var(--cd-ui-text-leise);
    margin-bottom: 3px;
}
.input {
    display: flex;
    align-items: center;
    height: 26px;
    padding: 0 8px;
    gap: 6px;
    background: var(--cd-ui-seite);
    border: 1px solid var(--cd-ui-kontur);
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
}
.input svg {
    width: 12px;
    height: 12px;
    margin-left: auto;
    color: var(--cd-ui-text-leise);
    flex: none;
}
.input.mono {
    font-family: var(--vp-font-family-mono);
    font-size: 11.5px;
}

/* Source tab opened by "Go to implementation" */
.code-view {
    position: absolute;
    inset: 0;
    z-index: 10;
    background: var(--cd-ui-seite);
    color: var(--cd-ui-text);
    font-family: var(--vp-font-family-mono);
    font-size: 13px;
    line-height: 24px;
    opacity: 0;
    visibility: hidden;
    transition:
        opacity 200ms var(--cd-ease),
        visibility 0s linear 200ms;
    overflow: hidden;
}
.is-code .code-view {
    opacity: 1;
    visibility: visible;
    transition: opacity 200ms var(--cd-ease);
}
.code-crumbs {
    font-family: var(--vp-font-family-base);
    font-size: 12px;
    color: var(--cd-ui-text-leise);
    padding: 8px 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.code-lines {
    list-style: none;
    margin: 0;
    padding: 0;
    counter-reset: ln;
}
.code-lines li {
    counter-increment: ln;
    white-space: pre;
    padding-right: 16px;
}
.code-lines li::before {
    content: counter(ln);
    display: inline-block;
    width: 48px;
    padding-right: 16px;
    text-align: right;
    color: var(--cd-ui-text-leise);
}
.code-lines li.hit {
    background: var(--cd-ui-abschnitt);
    box-shadow: inset 2px 0 0 var(--cd-ui-interaktion);
}
.code-lines .k,
.code-lines .a {
    font-weight: 600;
}
.code-lines .s {
    color: var(--cd-ui-text-leise);
}

/* BPMN diff: two read-only canvases at one zoom, centred with the legend */
.diff-view {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 28px;
    background: var(--cd-ui-seite);
    opacity: 0;
    visibility: hidden;
    transition:
        opacity 200ms var(--cd-ease),
        visibility 0s linear 200ms;
}
.is-diff .diff-view {
    opacity: 1;
    visibility: visible;
    transition: opacity 200ms var(--cd-ease);
}
.diff-view::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
    background: var(--cd-ui-linie);
}
.panes {
    align-self: stretch;
    display: flex;
}
.pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
}
.pane-title {
    font-size: 12px;
    color: var(--cd-ui-text-leise);
}
.bpmn-diff {
    display: block;
    width: 100%;
    height: auto;
}
/* Same zoom in both panes: the HEAD viewBox is 278 of the working tree's 402 units wide. */
.pane-before .bpmn-diff {
    width: calc(100% * 278 / 402);
}
.legend {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    height: 28px;
    padding: 0 10px;
    background: var(--cd-ui-seite);
    border: 1px solid var(--cd-ui-linie);
    border-radius: 6px;
    font-size: 12px;
    color: var(--cd-ui-text);
    white-space: nowrap;
}
.legend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.sw {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex: none;
}
/* brand-lint-disable */
/* The modeler's own diff colour for added elements (bpmn-js-differ). */
.sw-add {
    background: #52b415;
}
.bpmn-diff .added {
    stroke: #52b415;
}
.bpmn-diff .added-fill {
    fill: #52b415;
    stroke: none;
}
/* brand-lint-enable */
.sw-chg {
    box-shadow: inset 0 0 0 2px var(--cd-ui-text);
}
.sw-mov {
    box-shadow: inset 0 0 0 1px var(--cd-ui-kontur);
    background: repeating-linear-gradient(
        135deg,
        var(--cd-ui-kontur) 0 1.5px,
        transparent 1.5px 3.5px
    );
}

/* Output panel */
.output {
    flex: none;
    height: 0;
    overflow: hidden;
    background: var(--cd-ui-seite);
    border-top: 0 solid var(--cd-ui-linie);
    transition: height 300ms var(--cd-ease);
}
.is-output .output {
    height: 132px;
    border-top-width: 1px;
}
.is-diff.is-output .output {
    height: 198px;
}
.out-head {
    height: 30px;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 12px;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--cd-ui-text-leise);
}
.out-head .oh-out,
.is-diff .out-head .oh-term {
    color: var(--cd-ui-text);
    box-shadow: inset 0 -1px 0 var(--cd-ui-text);
    line-height: 22px;
}
.is-diff .out-head .oh-out {
    color: inherit;
    box-shadow: none;
}
.out-git,
.is-diff .out-deploy,
.is-diff .out-head .channel {
    display: none;
}
.is-diff .out-git {
    display: block;
}
.out-head .channel {
    margin-left: auto;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
    padding: 1px 8px;
    border: 1px solid var(--cd-ui-linie);
    border-radius: 4px;
}
.out-lines {
    list-style: none;
    margin: 0;
    padding: 4px 12px;
    font-family: var(--vp-font-family-mono);
    font-size: 12px;
    line-height: 22px;
}
.out-lines li {
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0;
    transition: opacity 200ms var(--cd-ease);
}
.out-lines .t {
    color: var(--cd-ui-text-leise);
}
.is-deploying .out-lines .l1,
.is-deployed .out-lines li,
.is-diff .out-git li {
    opacity: 1;
}

.ide-status {
    flex: none;
    height: 24px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 10px;
    white-space: nowrap;
    overflow: hidden;
    border-top: 1px solid var(--cd-ui-linie);
    color: var(--cd-ui-text-leise);
    font-size: 11px;
}
.ide-status svg {
    width: 12px;
    height: 12px;
}
.ide-status > span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
}
.st-done {
    overflow: hidden;
    text-overflow: ellipsis;
}
.ide-status svg,
.ide-status .dot {
    flex: none;
}
.ide-status .spacer {
    flex: 1;
}
.st-code,
.st-done {
    display: none !important;
}
.is-code .st-code {
    display: inline-flex !important;
}
.is-deployed .st-done {
    display: inline-flex !important;
    color: var(--cd-ui-text);
}
.is-deployed .st-target {
    display: none !important;
}
.dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cd-ui-kontur);
}

/* Keeps every rail subtitle to two lines on a 1280 screen. */
@media (min-width: 960px) and (max-width: 1379px) {
    .loop {
        --gap: 12px;
    }
    .loop-step p {
        font-size: 13px;
    }
}

@media (max-width: 959px) {
    .demo {
        grid-area: 2 / 1;
    }
    .loop {
        grid-area: 3 / 1;
        grid-template-columns: minmax(0, 1fr);
    }
    .loop-step {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        column-gap: 14px;
        padding-bottom: 16px;
    }
    .loop-step:last-child {
        padding-bottom: 0;
    }
    .loop-step:last-child .track::before,
    .loop-step:last-child .fill {
        display: none;
    }
    .track {
        grid-row: 1 / span 2;
        align-self: stretch;
        flex-direction: column;
        height: auto;
    }
    .track::before,
    .fill {
        top: 22px;
        right: auto;
        bottom: -16px;
        left: 50%;
        width: 1px;
        height: auto;
        margin: 0;
    }
    .fill {
        width: 2px;
        margin-left: -0.5px;
        transform: scaleY(0);
        transform-origin: center top;
    }
    .loop-step.is-running .fill {
        animation-name: fill-down;
    }
    .loop-step h2 {
        margin-top: 1px;
    }
    .ide-activity,
    .ide-side,
    .palette,
    .sim-palette,
    .log,
    .minimap-btn,
    .panel,
    .panel-handle,
    .output,
    .ide-status .st-problems {
        display: none;
    }
    .ide-title-text {
        font-size: 11px;
    }
    .ide-editor {
        flex: none;
        height: 300px;
    }
    .diff-view {
        gap: 20px;
    }
    .diff-view::before {
        display: none;
    }
    .panes {
        flex-direction: column;
        gap: 20px;
    }
    .pane + .pane {
        border-top: 1px solid var(--cd-ui-linie);
        padding-top: 20px;
    }
    .pane .bpmn-diff {
        width: min(100%, 300px);
    }
    .pane-before .bpmn-diff {
        width: min(calc(100% * 278 / 402), calc(300px * 278 / 402));
    }
    .tr {
        right: 10px;
    }
    .tab-java {
        display: none !important;
    }
    .code-view {
        font-size: 10.5px;
        line-height: 19px;
    }
    .code-lines li::before {
        width: 28px;
        padding-right: 8px;
    }
}
@keyframes fill-down {
    from {
        transform: scaleY(0);
    }
    to {
        transform: none;
    }
}

@media (prefers-reduced-motion: reduce) {
    .showcase *,
    .showcase *::before,
    .showcase *::after {
        transition: none !important;
        animation: none !important;
    }
}
.ide.no-anim,
.ide.no-anim * {
    transition: none !important;
}
</style>
