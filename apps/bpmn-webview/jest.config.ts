export default {
    displayName: "bpmn-webview",
    testEnvironment: "jsdom",
    transform: {
        "^.+\\.[tj]s$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.spec.json" }],
    },
    moduleFileExtensions: ["ts", "js"],
    coverageDirectory: "../../coverage/apps/bpmn-webview",
};
