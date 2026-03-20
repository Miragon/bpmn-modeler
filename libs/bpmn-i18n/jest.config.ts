export default {
    displayName: "bpmn-i18n",
    testEnvironment: "node",
    transform: {
        "^.+\\.[tj]s$": [
            "ts-jest",
            {
                tsconfig: "<rootDir>/../../tsconfig.base.json",
            },
        ],
    },
    moduleFileExtensions: ["ts", "js", "html"],
    coverageDirectory: "../../coverage/libs/bpmn-i18n",
};
