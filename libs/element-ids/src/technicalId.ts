import type { ModdleElementLike } from "./candidates";
import type { IdConvention } from "./convention";

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

/** `orderID` → `order`, `ID`; `IDNumber` → `ID`, `Number`. */
const humps = (word: string) =>
    word
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
        .split(" ");

const capitalize = (part: string) => part.charAt(0).toUpperCase() + part.slice(1);

// `any` accepts every shape, so it is spelled as the rule's default, camelCase.
const CASE_SPELLINGS: Readonly<Record<string, (parts: readonly string[]) => string>> = {
    "camelCase": (parts) =>
        parts.map((part, index) => (index === 0 ? part : capitalize(part))).join(""),
    "PascalCase": (parts) => parts.map(capitalize).join(""),
    "snake_case": (parts) => parts.join("_"),
    "kebab-case": (parts) => parts.join("-"),
};

const COUNTER_SEPARATORS: Readonly<Record<string, string>> = {
    "snake_case": "_",
    "kebab-case": "-",
};

/** What joins a counter to a name so the name stays in its case: `checkOrder2`, `check_order_2`. */
export function counterSeparatorOf(convention: IdConvention): string {
    return COUNTER_SEPARATORS[convention.case.label] ?? "";
}

/** Masks a leading digit the case or an XML ID forbids, as the Camunda plugin does with `N`. */
const digitMask = (convention: IdConvention) =>
    convention.case.label === "PascalCase" ? "N" : "n";

function nameInCase(name: string, convention: IdConvention): string | undefined {
    const parts = nameWords(name)
        .flatMap(humps)
        .map((part) => part.toLowerCase());
    if (parts.length === 0) {
        return undefined;
    }
    const spelled = (CASE_SPELLINGS[convention.case.label] ?? CASE_SPELLINGS.camelCase)(parts);
    return convention.case.pattern.test(spelled) ? spelled : `${digitMask(convention)}${spelled}`;
}

/** The ID an element of this type and name gets, or none when no letter or digit survives. */
export function technicalIdFor(
    name: string,
    element: ModdleElementLike,
    convention: IdConvention,
): string | undefined {
    const spelled = nameInCase(name, convention);
    if (spelled === undefined) {
        return undefined;
    }
    const id = `${convention.prefixesFor(element)[0] ?? ""}${spelled}`;
    return /^\d/.test(id) ? `${digitMask(convention)}${id}` : id;
}
