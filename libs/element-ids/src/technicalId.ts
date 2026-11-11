import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";

import { idSuffixOf, localType } from "./elementKinds";

// Letters NFD does not take apart, spelled the way German and Nordic users would write them in ASCII.
const TRANSLITERATIONS: Readonly<Record<string, string>> = {
    ä: "ae",
    ö: "oe",
    ü: "ue",
    Ä: "Ae",
    Ö: "Oe",
    Ü: "Ue",
    ß: "ss",
    æ: "ae",
    Æ: "Ae",
    ø: "o",
    Ø: "O",
    œ: "oe",
    Œ: "Oe",
    ł: "l",
    Ł: "L",
    đ: "d",
    Đ: "D",
    ð: "d",
    þ: "th",
};

/** The ASCII words of a name; apostrophes join, every other non-alphanumeric splits. */
function nameWords(name: string): string[] {
    return name
        .replace(/[äöüÄÖÜßæÆøØœŒłŁđĐðþ]/g, (letter) => TRANSLITERATIONS[letter] ?? letter)
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/['’]/g, "")
        .split(/[^A-Za-z0-9]+/)
        .filter((word) => word !== "");
}

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** `orderID` → `order`, `ID`; `IDNumber` → `ID`, `Number`. */
const humps = (word: string) =>
    word
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
        .split(" ");

const snake = (words: readonly string[]) => words.flatMap(humps).join("_").toLowerCase();

const SPELLINGS: Readonly<Record<ElementIdStyle, (words: string[], bpmnType: string) => string>> = {
    typePrefix: (words, bpmnType) => `${localType(bpmnType)}_${words.map(capitalize).join("")}`,
    typeSuffix: (words, bpmnType) => {
        const pascal = words.map(capitalize).join("");
        // An ID may not start with a digit; the plugin masks one with an `N`.
        return `${/^\d/.test(pascal) ? "N" : ""}${pascal}${idSuffixOf(bpmnType)}`;
    },
    snakeCase: (words, bpmnType) => `${snake([localType(bpmnType)])}_${snake(words)}`,
};

/** The ID an element of this type and name gets, or none when no letter or digit survives. */
export function technicalIdFor(
    name: string,
    bpmnType: string,
    style: ElementIdStyle,
): string | undefined {
    const words = nameWords(name);
    return words.length === 0 ? undefined : SPELLINGS[style](words, bpmnType);
}
