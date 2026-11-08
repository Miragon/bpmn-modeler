import { describe, expect, it } from "vitest";

import { QuestionQueue } from "./QuestionQueue";

interface HeldQuestion<T> {
    readonly ask: () => Promise<T>;
    readonly opened: () => boolean;
    answer(value: T): void;
    fail(error: Error): void;
}

function heldQuestion<T>(): HeldQuestion<T> {
    let isOpen = false;
    let resolveAnswer: (value: T) => void = () => undefined;
    let rejectAnswer: (error: Error) => void = () => undefined;
    return {
        ask: () => {
            isOpen = true;
            return new Promise<T>((resolve, reject) => {
                resolveAnswer = resolve;
                rejectAnswer = reject;
            });
        },
        opened: () => isOpen,
        answer: (value) => resolveAnswer(value),
        fail: (error) => rejectAnswer(error),
    };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("QuestionQueue", () => {
    it("opens a question only once the open one is answered", async () => {
        const queue = new QuestionQueue();
        const first = heldQuestion<string>();
        const second = heldQuestion<string>();

        const firstAnswer = queue.ask(first.ask);
        const secondAnswer = queue.ask(second.ask);
        await settle();
        const secondOpenWhileFirstOpen = second.opened();
        first.answer("first");
        await firstAnswer;
        await settle();

        expect(secondOpenWhileFirstOpen).toBe(false);
        expect(second.opened()).toBe(true);
        second.answer("second");
        expect(await secondAnswer).toBe("second");
        expect(await firstAnswer).toBe("first");
    });

    it("opens questions in the order they were asked", async () => {
        const queue = new QuestionQueue();
        const opened: string[] = [];

        await Promise.all(
            ["plugins", "rule packages", "plugins again"].map((name) =>
                queue.ask(async () => {
                    opened.push(name);
                }),
            ),
        );

        expect(opened).toEqual(["plugins", "rule packages", "plugins again"]);
    });

    it("hands a failed question's error to its asker and still opens the next", async () => {
        const queue = new QuestionQueue();
        const failing = heldQuestion<string>();

        const failed = queue.ask(failing.ask);
        const next = queue.ask(async () => "next");
        await settle();
        failing.fail(new Error("picker closed with the window"));

        await expect(failed).rejects.toThrow("picker closed with the window");
        expect(await next).toBe("next");
    });

    it("opens a question at once when none is open", async () => {
        const queue = new QuestionQueue();
        const only = heldQuestion<number>();

        const answer = queue.ask(only.ask);
        await settle();

        expect(only.opened()).toBe(true);
        only.answer(1);
        expect(await answer).toBe(1);
    });
});
