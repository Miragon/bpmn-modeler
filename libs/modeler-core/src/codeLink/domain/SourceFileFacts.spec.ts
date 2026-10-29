import { describe, expect, it } from "vitest";

import { contentDeclaresBean, contentImplementsLiteral } from "./ImplementationTarget";
import { SourceFileFacts } from "./SourceFileFacts";

describe("SourceFileFacts", () => {
    it("knows the beans named by Spring/CDI annotations", () => {
        const facts = SourceFileFacts.extract(
            `@Service("paymentService") class A {}\n@Component(value = 'invoiceWorker') class B {}\n@Named( "x" )`,
        );

        expect(facts.declaresBean("paymentService")).toBe(true);
        expect(facts.declaresBean("invoiceWorker")).toBe(true);
        expect(facts.declaresBean("x")).toBe(true);
        expect(facts.declaresBean("A")).toBe(false);
    });

    it("knows quoted literals, but not the code between them", () => {
        const facts = SourceFileFacts.extract(`@JobWorker(type = "payment") worker("a", 'b')`);

        expect(facts.implementsLiteral("payment")).toBe(true);
        expect(facts.implementsLiteral("a")).toBe(true);
        expect(facts.implementsLiteral("b")).toBe(true);
        expect(facts.implementsLiteral(", ")).toBe(false);
        expect(facts.implementsLiteral("type")).toBe(false);
    });

    it("ignores declarations inside XML comments and CDATA", () => {
        const facts = SourceFileFacts.extract(
            `<!-- @Service("commented") "inComment" --><![CDATA["inCdata"]]> "real"`,
        );

        expect(facts.declaresBean("commented")).toBe(false);
        expect(facts.implementsLiteral("inComment")).toBe(false);
        expect(facts.implementsLiteral("inCdata")).toBe(false);
        expect(facts.implementsLiteral("real")).toBe(true);
    });

    it("still finds a literal outside a comment after the same one inside it", () => {
        const content = `<!-- "x" --> "x"`;

        expect(SourceFileFacts.extract(content).implementsLiteral("x")).toBe(true);
        expect(contentImplementsLiteral(content, "x")).toBe(true);
    });

    it("finds an annotation nested in another one's quoted id", () => {
        const facts = SourceFileFacts.extract(`@Named("prefix @Service('inner') suffix")`);

        expect(facts.declaresBean("inner")).toBe(true);
        expect(contentDeclaresBean(`@Named("prefix @Service('inner') suffix")`, "inner")).toBe(
            true,
        );
    });

    it("decides only short literals without quotes, whitespace or section closes", () => {
        expect(SourceFileFacts.decidesLiteral("payment-service")).toBe(true);
        expect(SourceFileFacts.decidesLiteral("io.camunda:http-json:1")).toBe(true);
        expect(SourceFileFacts.decidesLiteral("")).toBe(true);
        expect(SourceFileFacts.decidesLiteral("two words")).toBe(false);
        expect(SourceFileFacts.decidesLiteral(`say"hi`)).toBe(false);
        expect(SourceFileFacts.decidesLiteral("a-->b")).toBe(false);
        expect(SourceFileFacts.decidesLiteral("a]]>b")).toBe(false);
        expect(SourceFileFacts.decidesLiteral("x".repeat(128))).toBe(true);
        expect(SourceFileFacts.decidesLiteral("x".repeat(129))).toBe(false);
    });

    describe("agrees with the content matchers", () => {
        const TOKENS = [
            `"`,
            `'`,
            " ",
            "<!--",
            "-->",
            "<![CDATA[",
            "]]>",
            "@Service(",
            "value = ",
            "pay",
            "x",
            "-",
        ];
        const LITERALS = ["pay", "x", "", "-", "pay-x", "x-", "-->", "pay x"];
        const BEANS = ["pay", "x", "payx"];

        // Deterministic so a failure reproduces.
        function seededRandom(seed: number): () => number {
            let state = seed;
            return () => {
                state = (state * 1103515245 + 12345) % 2147483648;
                return state / 2147483648;
            };
        }

        it("for every decidable literal and every bean id over generated sources", () => {
            const random = seededRandom(1599);
            for (let sample = 0; sample < 5000; sample++) {
                const length = 1 + Math.floor(random() * 16);
                const content = Array.from(
                    { length },
                    () => TOKENS[Math.floor(random() * TOKENS.length)],
                ).join("");
                const facts = SourceFileFacts.extract(content);

                for (const literal of LITERALS.filter(SourceFileFacts.decidesLiteral)) {
                    expect(facts.implementsLiteral(literal), `${literal} in ${content}`).toBe(
                        contentImplementsLiteral(content, literal),
                    );
                }
                for (const bean of BEANS) {
                    expect(facts.declaresBean(bean), `${bean} in ${content}`).toBe(
                        contentDeclaresBean(content, bean),
                    );
                }
            }
        });
    });
});
