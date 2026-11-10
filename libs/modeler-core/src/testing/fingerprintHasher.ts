import { ContentHasherPort } from "../bpmnPlugins/port/pluginPorts";

/**
 * Not SHA-256: a short FNV-1a fingerprint that keeps cache paths legible in
 * assertions. Unlike a hash of the length, any one changed character changes it.
 */
export const fingerprintHasher: ContentHasherPort = {
    sha256(text) {
        let hash = 0x811c9dc5;
        for (let index = 0; index < text.length; index++) {
            hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
        }
        return `h${(hash >>> 0).toString(16).padStart(8, "0")}`;
    },
};
