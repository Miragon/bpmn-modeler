export default {
    displayName: "modeler-plugin",
    testEnvironment: "node",
    transform: {
        "^.+\\.[tj]s$": [
            "ts-jest",
            {
                tsconfig: "<rootDir>/tsconfig.spec.json",
            },
        ],
    },
    moduleNameMapper: {
        "^@bpmn-modeler/shared$": "<rootDir>/../../libs/shared/src/index.ts",
    },
    moduleFileExtensions: ["ts", "js", "html"],
    coverageDirectory: "../../coverage/apps/modeler-plugin",
};
