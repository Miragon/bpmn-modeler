import {
    commentAndCdataRanges,
    containsCommentOrCdataClose,
    isInsideRanges,
    TextRange,
} from "@miragon/bpmn-modeler-types";

/**
 * A Spring/CDI bean-naming annotation up to the opening quote of its id, e.g.
 * `@Service("` or `@Component(value = '`.
 */
export const BEAN_ANNOTATION_PREFIX = String.raw`@(?:Component|Service|Repository|Named|Bean)\s*\(\s*(?:value\s*=\s*)?["']`;

const MAX_DECIDABLE_LITERAL_LENGTH = 128;
const QUOTE = /["']/g;
const DECLARED_BEAN = new RegExp(`${BEAN_ANNOTATION_PREFIX}([^"']*)["']`, "g");
const UNDECIDABLE_LITERAL_CHARACTER = /["'\s]/;

/**
 * What one source file declares, extracted once so later lookups need no
 * re-read: the bean ids of Spring/CDI naming annotations and the short quoted
 * literals. For every bean id and every literal {@link decidesLiteral} accepts,
 * the answers equal `contentDeclaresBean` / `contentImplementsLiteral` on the
 * file content.
 */
export class SourceFileFacts {
    private constructor(
        private readonly declaredBeans: ReadonlySet<string>,
        private readonly quotedLiterals: ReadonlySet<string>,
    ) {}

    static extract(content: string): SourceFileFacts {
        const commentRanges = commentAndCdataRanges(content);
        return new SourceFileFacts(
            extractDeclaredBeans(content, commentRanges),
            extractQuotedLiterals(content, commentRanges),
        );
    }

    /**
     * A literal with a quote could match across two quoted segments, and one
     * containing a comment or CDATA close could hide a match outside the
     * section behind one inside it. Whitespace and length are excluded so code
     * between two string literals is not kept.
     */
    static decidesLiteral(literal: string): boolean {
        return (
            literal.length <= MAX_DECIDABLE_LITERAL_LENGTH &&
            !UNDECIDABLE_LITERAL_CHARACTER.test(literal) &&
            !containsCommentOrCdataClose(literal)
        );
    }

    declaresBean(bean: string): boolean {
        return this.declaredBeans.has(bean);
    }

    implementsLiteral(literal: string): boolean {
        return this.quotedLiterals.has(literal);
    }
}

function extractDeclaredBeans(content: string, commentRanges: readonly TextRange[]): Set<string> {
    const beans = new Set<string>();
    const declaration = new RegExp(DECLARED_BEAN);
    for (let match = declaration.exec(content); match; match = declaration.exec(content)) {
        if (!isInsideRanges(commentRanges, match.index)) {
            beans.add(detachedCopy(match[1]));
        }
        // An annotation can sit inside another one's quoted id; resume right
        // after this match's start so it is not skipped.
        declaration.lastIndex = match.index + 1;
    }
    return beans;
}

function extractQuotedLiterals(content: string, commentRanges: readonly TextRange[]): Set<string> {
    const literals = new Set<string>();
    let openingQuote: number | undefined;
    for (const { index: closingQuote } of content.matchAll(QUOTE)) {
        if (openingQuote !== undefined && !isInsideRanges(commentRanges, openingQuote)) {
            const literal = content.slice(openingQuote + 1, closingQuote);
            if (SourceFileFacts.decidesLiteral(literal)) {
                literals.add(detachedCopy(literal));
            }
        }
        openingQuote = closingQuote;
    }
    return literals;
}

// A slice can share the whole file's string in V8; flattening a fresh
// concatenation copies it, so the index never keeps file contents alive.
function detachedCopy(value: string): string {
    return (" " + value).slice(1);
}
