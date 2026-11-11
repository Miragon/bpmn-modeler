import { describe, expect, it } from "vitest";

import {
    copiesToPrune,
    LAST_USE_REFRESH_MS,
    lastUseMarkerText,
    lastUseOf,
    ON_REQUEST_IDLE_LIMIT_MS,
    shouldRefreshLastUse,
    START_UP_IDLE_LIMIT_MS,
} from "./pluginCacheLastUse";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 11);
const COPY = "a".repeat(64);

describe("idle limits", () => {
    it("refreshes a copy's last use once a day and removes it at start-up after 30 idle days", () => {
        expect([LAST_USE_REFRESH_MS, START_UP_IDLE_LIMIT_MS, ON_REQUEST_IDLE_LIMIT_MS]).toEqual([
            DAY,
            30 * DAY,
            0,
        ]);
    });
});

describe("lastUseMarkerText", () => {
    it("writes the time as decimal epoch milliseconds that read back as the same time", () => {
        expect(lastUseMarkerText(NOW)).toBe("1794355200000");
        expect(lastUseOf(lastUseMarkerText(NOW))).toBe(NOW);
    });
});

describe("lastUseOf", () => {
    it.each<{ case: string; text: string | undefined; lastUse: number | undefined }>([
        { case: "a marker", text: "1794355200000", lastUse: NOW },
        { case: "the epoch", text: "0", lastUse: 0 },
        { case: "no marker", text: undefined, lastUse: undefined },
        { case: "an empty marker", text: "", lastUse: undefined },
        { case: "words", text: "yesterday", lastUse: undefined },
        { case: "a trailing letter", text: "123a", lastUse: undefined },
        { case: "a leading letter", text: "a123", lastUse: undefined },
        { case: "a negative time", text: "-5", lastUse: undefined },
        { case: "a fraction", text: "1.5", lastUse: undefined },
        { case: "an exponent", text: "1e3", lastUse: undefined },
        { case: "surrounding space", text: " 123", lastUse: undefined },
        { case: "a time past the safe integers", text: "9".repeat(20), lastUse: undefined },
        {
            case: "the largest safe integer",
            text: String(Number.MAX_SAFE_INTEGER),
            lastUse: Number.MAX_SAFE_INTEGER,
        },
    ])("reads $case as $lastUse", ({ text, lastUse }) => {
        expect(lastUseOf(text)).toBe(lastUse);
    });
});

describe("shouldRefreshLastUse", () => {
    it.each<{ case: string; lastWritten: number | undefined; refresh: boolean }>([
        { case: "a marker not written in this process", lastWritten: undefined, refresh: true },
        { case: "a marker written just now", lastWritten: NOW, refresh: false },
        {
            case: "a marker written a moment short of a day ago",
            lastWritten: NOW - DAY + 1,
            refresh: false,
        },
        { case: "a marker written a day ago", lastWritten: NOW - DAY, refresh: true },
        { case: "a marker written a week ago", lastWritten: NOW - 7 * DAY, refresh: true },
        {
            case: "a marker written before the clock went back",
            lastWritten: NOW + 1,
            refresh: true,
        },
    ])("is $refresh for $case", ({ lastWritten, refresh }) => {
        expect(shouldRefreshLastUse(lastWritten, NOW)).toBe(refresh);
    });
});

describe("copiesToPrune", () => {
    const usedAgo = (milliseconds: number) => lastUseMarkerText(NOW - milliseconds);

    it.each<{
        case: string;
        marker: string | undefined;
        inUse: boolean;
        maxIdleMs: number;
        pruned: boolean;
    }>([
        {
            case: "a copy without a marker",
            marker: undefined,
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: true,
        },
        {
            case: "a copy with an unreadable marker",
            marker: "soon",
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: true,
        },
        {
            case: "a copy used yesterday",
            marker: usedAgo(DAY),
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: false,
        },
        {
            case: "a copy used a moment short of the limit ago",
            marker: usedAgo(30 * DAY - 1),
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: false,
        },
        {
            case: "a copy used the limit ago",
            marker: usedAgo(30 * DAY),
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: true,
        },
        {
            case: "a copy used long ago",
            marker: usedAgo(365 * DAY),
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: true,
        },
        {
            case: "a copy another process marked after this one read the clock",
            marker: usedAgo(-1),
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: false,
        },
        {
            case: "a copy marked a day ahead, as clocks of two processes can differ",
            marker: usedAgo(-DAY),
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: false,
        },
        {
            case: "a copy marked more than a day ahead, while a clock ran ahead",
            marker: usedAgo(-DAY - 1),
            inUse: false,
            maxIdleMs: 30 * DAY,
            pruned: true,
        },
        {
            case: "a copy without a marker that an editor here is served",
            marker: undefined,
            inUse: true,
            maxIdleMs: 30 * DAY,
            pruned: false,
        },
        {
            case: "a long idle copy that an editor here is served",
            marker: usedAgo(365 * DAY),
            inUse: true,
            maxIdleMs: 30 * DAY,
            pruned: false,
        },
        {
            case: "a copy used just now, on request",
            marker: usedAgo(0),
            inUse: false,
            maxIdleMs: 0,
            pruned: true,
        },
        {
            case: "a copy marked after the clock was read, on request",
            marker: usedAgo(-DAY),
            inUse: false,
            maxIdleMs: 0,
            pruned: true,
        },
        {
            case: "a copy without a marker, on request",
            marker: undefined,
            inUse: false,
            maxIdleMs: 0,
            pruned: true,
        },
        {
            case: "a copy an editor here is served, on request",
            marker: usedAgo(0),
            inUse: true,
            maxIdleMs: 0,
            pruned: false,
        },
    ])("prunes $case: $pruned", ({ marker, inUse, maxIdleMs, pruned }) => {
        expect(
            copiesToPrune([COPY], {
                markerTextByCopy: new Map(marker === undefined ? [] : [[COPY, marker]]),
                inUse: new Set(inUse ? [COPY] : []),
                nowMs: NOW,
                maxIdleMs,
            }),
        ).toEqual(pruned ? [COPY] : []);
    });

    it("decides each copy by its own marker and keeps their order", () => {
        const [idle, recent, served, unmarked] = ["b", "c", "d", "e"].map((digit) =>
            digit.repeat(64),
        );

        expect(
            copiesToPrune([idle, recent, served, unmarked], {
                markerTextByCopy: new Map([
                    [idle, usedAgo(31 * DAY)],
                    [recent, usedAgo(DAY)],
                    [served, usedAgo(31 * DAY)],
                ]),
                inUse: new Set([served]),
                nowMs: NOW,
                maxIdleMs: START_UP_IDLE_LIMIT_MS,
            }),
        ).toEqual([idle, unmarked]);
    });
});
