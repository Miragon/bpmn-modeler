import type { VersionKeys } from "../../kernel/domain/mergeResult";
import type { MergeVersions } from "./versionNames";

const FNV_OFFSET_HIGH = 0xcbf29ce4;
const FNV_OFFSET_LOW = 0x84222325;
const FNV_PRIME_LOW = 0x1b3;
const TWO_TO_THE_32 = 0x1_0000_0000;

/** FNV-1a 64 over the text's UTF-16LE bytes, as 16 hex digits: a fingerprint, not a secure hash. */
export function versionKeyOf(text: string): string {
    let high = FNV_OFFSET_HIGH;
    let low = FNV_OFFSET_LOW;
    const mix = (byte: number): void => {
        low = (low ^ byte) >>> 0;
        // The 64-bit prime is 2^40 + 0x1b3, split into 32-bit halves to stay exact in doubles.
        const lowProduct = low * FNV_PRIME_LOW;
        high =
            (Math.imul(high, FNV_PRIME_LOW) +
                Math.floor(lowProduct / TWO_TO_THE_32) +
                (low << 8)) >>>
            0;
        low = lowProduct >>> 0;
    };
    for (let index = 0; index < text.length; index++) {
        const codeUnit = text.charCodeAt(index);
        mix(codeUnit & 0xff);
        mix(codeUnit >>> 8);
    }
    return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}

export function versionKeysOf(versions: MergeVersions): VersionKeys {
    return {
        current: versionKeyOf(versions.current),
        incoming: versionKeyOf(versions.incoming),
        ...(versions.base === undefined ? {} : { base: versionKeyOf(versions.base) }),
    };
}
