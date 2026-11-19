import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";

// The library types no host globals; the specs run in Node, which has a sub-millisecond clock.
declare const performance: { now(): number };

async function fastestMillisecondsOf(run: () => unknown): Promise<number> {
    let fastest = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt++) {
        const started = performance.now();
        await run();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}

/**
 * How long `work` takes per millisecond of parsing `xml`, best of five each: both share the
 * runner's load, and parsing a large file is long enough that one slow or fast round of either
 * barely moves the ratio, unlike a denominator of a few milliseconds.
 */
export async function perParseOf(xml: string, work: () => unknown): Promise<number> {
    const moddle = (await loadBpmnModdle())();
    const parsing = await fastestMillisecondsOf(() => moddle.fromXML(xml));
    return (await fastestMillisecondsOf(work)) / parsing;
}
