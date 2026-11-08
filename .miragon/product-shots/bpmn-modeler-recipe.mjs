export default class BpmnModelerRecipe {
    #options;

    constructor(options) {
        for (const key of ["process", "selectId", "linting", "decision", "decisionInputs"]) {
            if (options[key] === undefined)
                throw new Error(`The bpmn-modeler recipe needs "shots.${key}".`);
        }
        this.#options = options;
    }

    async capture(window) {
        await this.#editor(window);
        await this.#linting(window);
        await this.#decision(window);
        await this.#simulation(window);
        await this.#hero(window);
    }

    async #editor(window) {
        await this.#showSideBar(window, true);
        const frame = await this.#open(
            window,
            this.#options.process,
            this.#shape(this.#options.selectId),
        );
        await frame
            .locator(`${this.#shape(this.#options.selectId)} > .djs-hit`)
            .first()
            .click();
        await frame.locator(".bio-properties-panel").first().waitFor();
        await window.pause(800);
        await window.shot("editor", { title: this.#title(this.#options.process) });
        await window.page.keyboard.press("Escape");
    }

    async #simulation(window) {
        await this.#showSideBar(window, false);
        const frame = await this.#open(
            window,
            this.#options.process,
            this.#shape(this.#options.selectId),
        );
        await frame.locator(".bts-toggle-mode").first().click();
        await window.pause(600);
        await frame.locator(".bts-context-pad").first().click();
        await window.pause(2500);
        await window.restPointer();
        await window.shot("simulation", { title: this.#title(this.#options.process) });
        await frame.locator(".bts-toggle-mode").first().click();
        await window.pause(400);
    }

    async #linting(window) {
        await this.#showSideBar(window, false);
        await this.#open(window, this.#options.linting, ".bjsl-button-error");
        await window.pause(800);
        await window.restPointer();
        await window.shot("linting", { title: this.#title(this.#options.linting) });
    }

    async #decision(window) {
        await this.#showSideBar(window, false);
        const frame = await this.#open(window, this.#options.decision, ".drill-down-overlay");
        await frame.locator(".drill-down-overlay").first().click();
        await frame.locator(".tjs-table").first().waitFor();
        await this.#simulateDecision(frame);
        await window.pause(800);
        await window.restPointer();
        await window.shot("decision", { title: this.#title(this.#options.decision) });
    }

    async #simulateDecision(frame) {
        const controls = frame.locator(".dmn-sim-field .dmn-sim-input");
        for (const [index, value] of this.#options.decisionInputs.entries()) {
            const control = controls.nth(index);
            const options = await control.evaluate((element) =>
                [...(element.options ?? [])].map((option) => option.value),
            );
            if (options.length)
                await control.selectOption(
                    options.find((option) => option.replaceAll('"', "") === value),
                );
            else await control.fill(value);
        }
        await frame.locator(".dmn-sim-run").click();
    }

    async #hero(window) {
        await this.#showSideBar(window, false);
        await this.#open(window, this.#options.process, this.#shape(this.#options.selectId));
        await window.restPointer();
        await window.pause(600);
        const editor = await window.page
            .locator(".part.editor .editor-group-container")
            .first()
            .locator(".editor-container")
            .boundingBox();
        await window.hero({
            x: editor.x + 4,
            y: editor.y + 4,
            width: editor.width - 8,
            height: editor.height - 8,
        });
    }

    async #open(window, file, readySelector) {
        await window.runCommand("View: Close All Editors");
        await this.#quickOpen(window, file);
        for (let attempt = 0; attempt < 900; attempt++) {
            for (const frame of window.page.frames()) {
                if (
                    (await frame
                        .locator(readySelector)
                        .count()
                        .catch(() => 0)) > 0
                ) {
                    await window.pause(1000);
                    return frame;
                }
            }
            await window.pause(100);
        }
        throw new Error(`No editor shows ${readySelector} for ${file}.`);
    }

    async #quickOpen(window, file) {
        await window.page.keyboard.press("F1");
        const input = window.page.locator(".quick-input-widget input");
        await input.waitFor();
        await input.fill(file);
        await window.page.locator(".quick-input-list .monaco-list-row").first().waitFor();
        await window.page.keyboard.press("Enter");
        await window.page.locator(".quick-input-widget").waitFor({ state: "hidden" });
        await window.pause(3000);
    }

    async #showSideBar(window, visible) {
        const shown = await window.page
            .locator(".part.sidebar")
            .isVisible()
            .catch(() => false);
        if (shown !== visible) await window.runCommand("View: Toggle Primary Side Bar Visibility");
        if (visible) await window.runCommand("View: Show Explorer");
    }

    #shape(elementId) {
        return `.djs-shape[data-element-id="${elementId}"]`;
    }

    #title(file) {
        return file.split("/").at(-1);
    }
}
