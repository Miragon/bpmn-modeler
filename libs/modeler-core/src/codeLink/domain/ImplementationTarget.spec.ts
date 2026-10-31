import { describe, expect, it } from "vitest";

import { ImplementationKind } from "./ImplementationReference";
import { ImplementationTarget } from "./ImplementationTarget";
import { SourceFileFacts } from "./SourceFileFacts";

const JVM_SOURCES_GLOB = "**/*.{java,kt,groovy,scala}";
const SOURCES_GLOB = "**/*.{java,kt,groovy,scala,js,ts}";

interface TargetRow {
    kind: ImplementationKind;
    reference: string;
}

describe("ImplementationTarget", () => {
    it.each<TargetRow & { path: string; matches: boolean }>([
        { kind: "javaClass", reference: "Foo", path: "/src/MyFoo.java", matches: false },
        { kind: "javaClass", reference: "Foo", path: "/src/Foo.kt", matches: true },
        {
            kind: "javaClass",
            reference: "com.x.A",
            path: "/a/src/main/java/com/x/A.java",
            matches: true,
        },
        { kind: "javaClass", reference: "com.x.A", path: "com/x/A.groovy", matches: true },
        { kind: "javaClass", reference: "com.x.A", path: "/a/org/x/A.java", matches: false },
        { kind: "javaClass", reference: "com.x.A", path: "/a/com/x/A.txt", matches: false },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/s/MyBean.java",
            matches: true,
        },
        {
            kind: "expression",
            reference: "#{ myBean.run() }",
            path: "/s/MyBean.kt",
            matches: true,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/s/NotMyBean.java",
            matches: false,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/s/MyBean.txt",
            matches: false,
        },
        { kind: "expression", reference: "${1+2}", path: "/s/MyBean.java", matches: false },
        { kind: "jobType", reference: "Pay", path: "/s/Pay.java", matches: false },
        { kind: "externalTopic", reference: "Pay", path: "/s/Pay.java", matches: false },
    ])(
        "matchesFileName: $kind $reference vs $path → $matches",
        ({ kind, reference, path, matches }) => {
            expect(ImplementationTarget.of(kind, reference).matchesFileName(path)).toBe(matches);
        },
    );

    it.each<TargetRow & { path: string; content: string | undefined; implemented: boolean }>([
        {
            kind: "javaClass",
            reference: "com.example.Charge",
            path: "/x/com/example/Charge.java",
            content: undefined,
            implemented: true,
        },
        {
            kind: "javaClass",
            reference: "com.example.Charge",
            path: "/x/Other.java",
            content: '@Service("com.example.Charge") "com.example.Charge"',
            implemented: false,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/src/MyBean.java",
            content: undefined,
            implemented: true,
        },
        {
            kind: "expression",
            reference: "${myBean}",
            path: "/src/Renamed.java",
            content: '@Service("myBean")',
            implemented: true,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/src/Renamed.java",
            content: '@Component(value = "myBean")',
            implemented: true,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/src/worker.ts",
            content: '@Service("myBean")',
            implemented: false,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/src/Renamed.java",
            content: '@Service("other")',
            implemented: false,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/src/Renamed.java",
            content: "class X {}",
            implemented: false,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/src/Renamed.java",
            content: undefined,
            implemented: false,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            path: "/src/Renamed.java",
            content: '<!-- @Service("myBean") -->',
            implemented: false,
        },
        {
            kind: "expression",
            reference: "${1+2}",
            path: "/src/Renamed.java",
            content: '@Service("1") "1+2"',
            implemented: false,
        },
        {
            kind: "jobType",
            reference: "pay",
            path: "/src/W.java",
            content: '@JobWorker(type = "pay")',
            implemented: true,
        },
        {
            kind: "jobType",
            reference: "pay",
            path: "/src/W.java",
            content: undefined,
            implemented: false,
        },
        {
            kind: "jobType",
            reference: "pay",
            path: "/src/W.java",
            content: '<!-- "pay" -->',
            implemented: false,
        },
        {
            kind: "jobType",
            reference: "pay",
            path: "/src/W.java",
            content: 'xml("<![CDATA[<!--]]>"); @JobWorker(type = "pay") xml("-->")',
            implemented: true,
        },
        {
            kind: "jobType",
            reference: "pay",
            path: "/src/W.java",
            content: 'type = "payment"',
            implemented: false,
        },
        {
            kind: "externalTopic",
            reference: "topic",
            path: "/src/W.java",
            content: "'topic'",
            implemented: true,
        },
        {
            kind: "externalTopic",
            reference: "a.b",
            path: "/src/W.java",
            content: '"axb"',
            implemented: false,
        },
    ])(
        "isImplementedBy: $kind $reference in $path with $content → $implemented",
        ({ kind, reference, path, content, implemented }) => {
            expect(ImplementationTarget.of(kind, reference).isImplementedBy(path, content)).toBe(
                implemented,
            );
        },
    );

    it.each<{ kind: unknown; known: boolean }>([
        { kind: "javaClass", known: true },
        { kind: "delegateExpression", known: true },
        { kind: "expression", known: true },
        { kind: "externalTopic", known: true },
        { kind: "jobType", known: true },
        { kind: "bogus", known: false },
        { kind: "", known: false },
        { kind: "toString", known: false },
        { kind: undefined, known: false },
        { kind: 42, known: false },
    ])("isKnownKind($kind) → $known", ({ kind, known }) => {
        expect(ImplementationTarget.isKnownKind(kind)).toBe(known);
    });

    it.each<TargetRow & { label: string }>([
        { kind: "javaClass", reference: "com.x.A", label: "class" },
        { kind: "delegateExpression", reference: "${myBean}", label: "delegate" },
        { kind: "expression", reference: "${1+2}", label: "expression" },
        { kind: "externalTopic", reference: "topic", label: "external task topic" },
        { kind: "jobType", reference: "pay", label: "job type" },
    ])("labels $kind as $label", ({ kind, reference, label }) => {
        expect(ImplementationTarget.of(kind, reference).label).toBe(label);
    });

    it.each<TargetRow & { glob: string | undefined; searchable: boolean }>([
        {
            kind: "javaClass",
            reference: "com.example.MyDelegate",
            glob: "**/com/example/MyDelegate.{java,kt,groovy,scala}",
            searchable: true,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            glob: "**/MyBean.{java,kt,groovy,scala}",
            searchable: true,
        },
        {
            kind: "expression",
            reference: "${svc.run()}",
            glob: "**/Svc.{java,kt,groovy,scala}",
            searchable: true,
        },
        { kind: "expression", reference: "${1+2}", glob: undefined, searchable: false },
        { kind: "jobType", reference: "pay", glob: undefined, searchable: true },
        { kind: "externalTopic", reference: "topic", glob: undefined, searchable: true },
    ])(
        "searches $kind $reference by file name $glob (searchable: $searchable)",
        ({ kind, reference, glob, searchable }) => {
            const target = ImplementationTarget.of(kind, reference);

            expect(target.fileNameGlob).toBe(glob);
            expect(target.isSearchable).toBe(searchable);
        },
    );

    it.each<TargetRow & { fileNameMatches: string[]; glob: string | undefined }>([
        { kind: "javaClass", reference: "com.x.A", fileNameMatches: [], glob: undefined },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            fileNameMatches: [],
            glob: JVM_SOURCES_GLOB,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            fileNameMatches: ["/s/MyBean.java"],
            glob: undefined,
        },
        { kind: "expression", reference: "${1+2}", fileNameMatches: [], glob: undefined },
        { kind: "jobType", reference: "pay", fileNameMatches: [], glob: SOURCES_GLOB },
        { kind: "externalTopic", reference: "topic", fileNameMatches: [], glob: SOURCES_GLOB },
    ])(
        "searches the content of $kind $reference after the file names $fileNameMatches in $glob",
        ({ kind, reference, fileNameMatches, glob }) => {
            const search = ImplementationTarget.of(kind, reference).contentSearchAfter(
                fileNameMatches,
            );

            expect(search?.files.glob()).toBe(glob);
        },
    );

    it.each<TargetRow & { content: string; found: boolean }>([
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            content: "@Named( 'myBean' )",
            found: true,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            content: '@Service("myBeanX")',
            found: false,
        },
        { kind: "jobType", reference: "a.b", content: "'a.b'", found: true },
        { kind: "jobType", reference: "a.b", content: '"axb"', found: false },
    ])(
        "searches the content of $kind $reference for $content → $found",
        ({ kind, reference, content, found }) => {
            const search = ImplementationTarget.of(kind, reference).contentSearchAfter([]);

            expect(search?.pattern.test(content)).toBe(found);
        },
    );

    it.each<TargetRow & { content: string; withContent: boolean; declared: boolean }>([
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            content: '@Service("myBean")',
            withContent: false,
            declared: true,
        },
        {
            kind: "delegateExpression",
            reference: "${myBean}",
            content: "class MyBean {}",
            withContent: true,
            declared: false,
        },
        {
            kind: "jobType",
            reference: "pay",
            content: 'type = "pay"',
            withContent: false,
            declared: true,
        },
        {
            kind: "jobType",
            reference: "pay",
            content: 'type = "payment"',
            withContent: true,
            declared: false,
        },
        {
            kind: "externalTopic",
            reference: "pay now",
            content: 'topic = "pay now"',
            withContent: true,
            declared: true,
        },
        {
            kind: "externalTopic",
            reference: "pay now",
            content: 'topic = "pay now"',
            withContent: false,
            declared: false,
        },
        {
            kind: "javaClass",
            reference: "com.x.A",
            content: '@Service("com.x.A") "com.x.A"',
            withContent: true,
            declared: false,
        },
        {
            kind: "expression",
            reference: "${1+2}",
            content: '"1+2"',
            withContent: true,
            declared: false,
        },
    ])(
        "isDeclaredIn: $kind $reference in $content (content passed: $withContent) → $declared",
        ({ kind, reference, content, withContent, declared }) => {
            const facts = SourceFileFacts.extract(content);

            expect(
                ImplementationTarget.of(kind, reference).isDeclaredIn(
                    facts,
                    withContent ? content : undefined,
                ),
            ).toBe(declared);
        },
    );

    it.each<TargetRow & { decided: boolean }>([
        { kind: "jobType", reference: "pay", decided: true },
        { kind: "externalTopic", reference: "pay now", decided: false },
        { kind: "jobType", reference: 'say"hi', decided: false },
        { kind: "delegateExpression", reference: "${myBean}", decided: true },
        { kind: "javaClass", reference: "com.x.A", decided: true },
    ])(
        "decides $kind $reference from the facts alone: $decided",
        ({ kind, reference, decided }) => {
            expect(ImplementationTarget.of(kind, reference).isDecidedByFacts).toBe(decided);
        },
    );
});
