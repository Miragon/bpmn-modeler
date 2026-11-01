/**
 * What one task's implementation reference asks of a source file, and the one
 * place that dispatches on the implementation kind.
 *
 * The matchers are the load-bearing piece. They are shared verbatim by the
 * always-on map's two cheap operations — *verifying* an already-linked file
 * still implements its activity, and *live-linking* a just-saved file to an
 * unresolved activity — and by the locator's batched scan, so all three agree on
 * what "implements" means without re-walking the workspace per reference.
 *
 * No `vscode` / Node host modules — only `path` (string math). The matchers
 * operate on content the caller already read, so this stays unit-testable
 * against plain strings.
 */
import { posix } from "path";

import { matchesOutsideCommentsAndCdata } from "@miragon/bpmn-modeler-types";

import { escapeRegExpLiteral } from "../../kernel/domain/escapeRegExpLiteral";

import {
    beanToClassName,
    extractBeanName,
    fqcnToGlobPath,
    ImplementationKind,
    JVM_EXTENSIONS,
    JVM_SOURCE_FILES,
    SOURCE_FILES,
    SourceFileSet,
} from "./ImplementationReference";
import { BEAN_ANNOTATION_PREFIX, SourceFileFacts } from "./SourceFileFacts";

const KIND_LABELS: Record<ImplementationKind, string> = {
    javaClass: "class",
    delegateExpression: "delegate",
    expression: "expression",
    externalTopic: "external task topic",
    jobType: "job type",
};

const KNOWN_KINDS: ReadonlySet<unknown> = new Set(Object.keys(KIND_LABELS));

export interface ContentSearch {
    readonly files: SourceFileSet;
    /**
     * Matched outside XML comments and CDATA sections only. Java/JS comments
     * still count: a naive stripper would cut at a `//` inside a string literal
     * and hide a real match, worse than an extra heuristic link.
     */
    readonly pattern: RegExp;
}

export abstract class ImplementationTarget {
    constructor(
        private readonly kind: ImplementationKind,
        protected readonly reference: string,
    ) {}

    static of(kind: ImplementationKind, reference: string): ImplementationTarget {
        switch (kind) {
            case "javaClass":
                return new ClassTarget(kind, reference);
            case "delegateExpression":
            case "expression": {
                const bean = extractBeanName(reference);
                return bean === undefined
                    ? new UnsearchableTarget(kind, reference)
                    : new BeanTarget(kind, reference, bean);
            }
            case "externalTopic":
            case "jobType":
                return new LiteralTarget(kind, reference);
        }
    }

    /** A kind that crossed a message boundary is typed, but not checked. */
    static isKnownKind(kind: unknown): kind is ImplementationKind {
        return KNOWN_KINDS.has(kind);
    }

    get label(): string {
        return KIND_LABELS[this.kind];
    }

    /** The host glob for the files {@link matchesFileName} accepts. */
    abstract readonly fileNameGlob: string | undefined;

    protected abstract readonly contentSearch: ContentSearch | undefined;

    get isSearchable(): boolean {
        return this.fileNameGlob !== undefined || this.contentSearch !== undefined;
    }

    /** Whether {@link isDeclaredIn} can answer without the file content. */
    get isDecidedByFacts(): boolean {
        return true;
    }

    abstract matchesFileName(absolutePath: string): boolean;

    /** A file-name match settles the target, so the content is searched only without one. */
    contentSearchAfter(fileNameMatches: readonly string[]): ContentSearch | undefined {
        return fileNameMatches.length > 0 ? undefined : this.contentSearch;
    }

    /**
     * The one decision both verification and live-linking ask: does the file at
     * `absolutePath` (with already-read `content`) implement the target?
     * `content` is optional because a file name can decide alone; the
     * content-based targets report `false` when content is unavailable.
     */
    abstract isImplementedBy(absolutePath: string, content?: string): boolean;

    /** The batched scan's check of a file whose name did not settle the target. */
    abstract isDeclaredIn(
        absolutePath: string,
        facts: SourceFileFacts,
        content: string | undefined,
    ): boolean;
}

/** `camunda:class` is a fully-qualified class name, so the file path alone decides. */
class ClassTarget extends ImplementationTarget {
    protected readonly contentSearch = undefined;

    get fileNameGlob(): string {
        return JVM_SOURCE_FILES.glob(fqcnToGlobPath(this.reference));
    }

    matchesFileName(absolutePath: string): boolean {
        return matchesClassPath(this.reference, absolutePath);
    }

    isImplementedBy(absolutePath: string): boolean {
        return this.matchesFileName(absolutePath);
    }

    isDeclaredIn(): boolean {
        return false;
    }
}

/** Navigate searches the bean annotation only in these files, so the map links no other. */
const BEAN_ANNOTATION_FILES = JVM_SOURCE_FILES;

/**
 * Delegate / expression bindings name a bean, not a file. The capitalised bean
 * id is the first guess at the class file; the fallback is a Spring/CDI
 * bean-naming annotation carrying the exact bean id, for a class named
 * differently (e.g. an explicitly named `@Service("myBean")`).
 */
class BeanTarget extends ImplementationTarget {
    constructor(
        kind: ImplementationKind,
        reference: string,
        private readonly bean: string,
    ) {
        super(kind, reference);
    }

    get fileNameGlob(): string {
        return JVM_SOURCE_FILES.glob(beanToClassName(this.bean));
    }

    protected get contentSearch(): ContentSearch {
        return { files: BEAN_ANNOTATION_FILES, pattern: beanAnnotationPattern(this.bean) };
    }

    matchesFileName(absolutePath: string): boolean {
        return matchesBeanClassName(this.bean, absolutePath);
    }

    isImplementedBy(absolutePath: string, content?: string): boolean {
        return (
            this.matchesFileName(absolutePath) ||
            (content !== undefined &&
                BEAN_ANNOTATION_FILES.includes(absolutePath) &&
                contentDeclaresBean(content, this.bean))
        );
    }

    isDeclaredIn(absolutePath: string, facts: SourceFileFacts): boolean {
        return facts.declaresBean(this.bean) && BEAN_ANNOTATION_FILES.includes(absolutePath);
    }
}

/**
 * External-task topics and Zeebe job types are free-form literals declared on
 * the worker side, so the only reliable signal is the quoted literal in source
 * — e.g. `@ExternalTaskSubscription("payment-topic")`,
 * `@JobWorker(type = "payment-service")`, or `taskType: "payment-service"`.
 */
class LiteralTarget extends ImplementationTarget {
    readonly fileNameGlob = undefined;

    protected get contentSearch(): ContentSearch {
        return { files: SOURCE_FILES, pattern: literalPattern(this.reference) };
    }

    override get isDecidedByFacts(): boolean {
        return SourceFileFacts.decidesLiteral(this.reference);
    }

    matchesFileName(): boolean {
        return false;
    }

    isImplementedBy(_absolutePath: string, content?: string): boolean {
        return content !== undefined && contentImplementsLiteral(content, this.reference);
    }

    isDeclaredIn(
        _absolutePath: string,
        facts: SourceFileFacts,
        content: string | undefined,
    ): boolean {
        if (this.isDecidedByFacts) {
            return facts.implementsLiteral(this.reference);
        }
        return content !== undefined && contentImplementsLiteral(content, this.reference);
    }
}

/** An expression without a leading bean id names nothing a file could implement. */
class UnsearchableTarget extends ImplementationTarget {
    readonly fileNameGlob = undefined;

    protected readonly contentSearch = undefined;

    matchesFileName(): boolean {
        return false;
    }

    isImplementedBy(): boolean {
        return false;
    }

    isDeclaredIn(): boolean {
        return false;
    }
}

/**
 * The package path is matched as a suffix so the class is found under any
 * source root (`src/main/java`, …), on a segment boundary so a no-package
 * `Foo` does not match `MyFoo.java`.
 */
function matchesClassPath(fqcn: string, absolutePath: string): boolean {
    const packagePath = fqcnToGlobPath(fqcn);
    return JVM_EXTENSIONS.some((ext) => {
        const suffix = `${packagePath}.${ext}`;
        return absolutePath === suffix || absolutePath.endsWith(`/${suffix}`);
    });
}

/**
 * Whether the file is the conventional implementing class for a bean id —
 * `myBean` → `MyBean.java`. The first guess the locator makes for a
 * delegate/expression binding, matched on the file's basename alone.
 */
function matchesBeanClassName(bean: string, absolutePath: string): boolean {
    const className = beanToClassName(bean);
    const base = posix.basename(absolutePath);
    return JVM_EXTENSIONS.some((ext) => base === `${className}.${ext}`);
}

/**
 * Whether `content` declares a worker for a free-form literal (external-task
 * topic or Zeebe job type) — the literal appears quoted, e.g.
 * `@JobWorker(type = "payment")` or `taskType: "payment"`.
 */
export function contentImplementsLiteral(content: string, literal: string): boolean {
    return matchesOutsideCommentsAndCdata(content, literalPattern(literal));
}

/**
 * Whether `content` declares a Spring/CDI bean carrying the exact bean id, e.g.
 * `@Service("myBean")` — the fallback when the class file name differs from the
 * bean (an explicitly named `@Component(value = "myBean")`).
 */
export function contentDeclaresBean(content: string, bean: string): boolean {
    return matchesOutsideCommentsAndCdata(content, beanAnnotationPattern(bean));
}

function literalPattern(literal: string): RegExp {
    return new RegExp(`["']${escapeRegExpLiteral(literal)}["']`);
}

function beanAnnotationPattern(bean: string): RegExp {
    return new RegExp(`${BEAN_ANNOTATION_PREFIX}${escapeRegExpLiteral(bean)}["']`);
}
