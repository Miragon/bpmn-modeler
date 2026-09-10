import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "bpmn-layout",
        // Node environment (no jsdom): the pure layers touch no DOM, and the
        // engine adapter runs on bpmn-moddle, which is Node-safe. Nothing here
        // needs a rendered diagram — bpmn-js is only ever met through fakes.
        environment: "node",
        include: ["src/**/*.{spec,test}.ts"],
        alias: {
            "@miragon/bpmn-modeler-types": resolve(
                __dirname,
                "../../libs/modeler-types/src/index.ts",
            ),
        },
    },
});
