import type { ModdleElementLike } from "./moddleElement";
import { keepsIdUnlessAsked, localType } from "./elementKinds";

/**
 * The part of `@miragon/rules/element-id-naming`'s `ElementIdConvention` that
 * spelling an ID needs. The lint stack hands it in: this library may not import
 * it, since the package keeps lint code out of its root and design entries.
 */
export interface IdConvention {
    /** Every prefix an ID of this element may start with, the one to write first; empty for a type the convention leaves out. */
    prefixesFor(element: ModdleElementLike): string[];
    /** The case the name after the prefix follows, under the rule's own label. */
    readonly case: { readonly label: string; readonly pattern: RegExp };
}

const lowerFirst = (word: string) => word.charAt(0).toLowerCase() + word.slice(1);

/**
 * Until a host hands in the rule's convention: the element's own type in
 * camelCase, then a camelCase name. A process keeps its name only, as the rule
 * leaves its ID to the business.
 */
export const FALLBACK_CONVENTION: IdConvention = {
    prefixesFor: (element) =>
        keepsIdUnlessAsked(element.$type) ? [] : [`${lowerFirst(localType(element.$type))}_`],
    case: { label: "camelCase", pattern: /^[a-z][A-Za-z0-9]*$/ },
};
