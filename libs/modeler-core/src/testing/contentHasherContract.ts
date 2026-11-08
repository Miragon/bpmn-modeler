import { describe, expect, it } from "vitest";

import { ContentHasherPort } from "../bpmnPlugins/port/pluginPorts";

interface HashVector {
    readonly behaviour: string;
    readonly text: string;
    readonly sha256: string;
}

const VECTORS: readonly HashVector[] = [
    {
        behaviour: "the empty text",
        text: "",
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
    {
        behaviour: "an ASCII text",
        text: "abc",
        sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    },
    {
        behaviour: "a text outside ASCII",
        text: "Prüfung ✓",
        sha256: "2ab1d0f52489af0314671f153d0ab416cc1ceb6081c37667e5ff2c918f0c2042",
    },
];

/**
 * The rules of {@link ContentHasherPort} the core relies on, run against one
 * adapter. The hash is SHA-256 of the text's UTF-8 bytes, written as 64
 * lowercase hex digits: an approval stored by one host must match the hash
 * another host computes, and the plugin cache names its folders by it.
 */
export function describeContentHasherContract(
    adapter: string,
    createHasher: () => ContentHasherPort,
): void {
    describe(`${adapter} keeps the ContentHasherPort contract`, () => {
        it.each(VECTORS)("hashes $behaviour as SHA-256", ({ text, sha256 }) => {
            expect(createHasher().sha256(text)).toBe(sha256);
        });

        it.each(VECTORS)("writes the hash of $behaviour as 64 lowercase hex digits", ({ text }) => {
            expect(createHasher().sha256(text)).toMatch(/^[0-9a-f]{64}$/);
        });
    });
}
