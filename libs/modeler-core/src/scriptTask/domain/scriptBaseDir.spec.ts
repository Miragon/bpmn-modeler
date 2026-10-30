import { describe, expect, it } from "vitest";

import {
    editorScriptDir,
    keepsScriptsInOsTemp,
    osTempScriptBaseDir,
    scriptFilePath,
    scriptGitignorePath,
    workspaceScriptBaseDir,
} from "./scriptBaseDir";
import { ScriptUri } from "./ScriptUri";

describe("keepsScriptsInOsTemp", () => {
    it.each([
        { documentScheme: "file", inOsTemp: false },
        { documentScheme: "untitled", inOsTemp: true },
        { documentScheme: "vscode-vfs", inOsTemp: true },
        { documentScheme: "git", inOsTemp: true },
    ])(
        "$documentScheme: documents keep their scripts in the OS temp folder: $inOsTemp",
        ({ documentScheme, inOsTemp }) => {
            expect(keepsScriptsInOsTemp(documentScheme)).toBe(inOsTemp);
        },
    );
});

describe("osTempScriptBaseDir", () => {
    it.each([
        { osTempDir: "/tmp", path: "/tmp/miragon-bpmn-modeler/tmp/scripting" },
        {
            osTempDir: "/var/folders/T/",
            path: "/var/folders/T/miragon-bpmn-modeler/tmp/scripting",
        },
        {
            osTempDir: "C:\\Users\\peter\\AppData\\Local\\Temp",
            path: "C:/Users/peter/AppData/Local/Temp/miragon-bpmn-modeler/tmp/scripting",
        },
        {
            osTempDir: "/c:/Users/peter/AppData/Local/Temp",
            path: "/c:/Users/peter/AppData/Local/Temp/miragon-bpmn-modeler/tmp/scripting",
        },
        {
            osTempDir: "\\\\server\\profiles\\peter\\Temp",
            path: "//server/profiles/peter/Temp/miragon-bpmn-modeler/tmp/scripting",
        },
    ])("$osTempDir holds scripts in $path and names it whole", ({ osTempDir, path }) => {
        expect(osTempScriptBaseDir(osTempDir)).toEqual({ path, displayName: path });
    });
});

describe("workspaceScriptBaseDir", () => {
    it.each([
        {
            root: "/ws",
            configFolder: ".camunda",
            path: "/ws/.camunda/tmp/scripting",
            displayName: ".camunda/tmp/scripting",
        },
        {
            root: "/ws/",
            configFolder: "config/bpmn",
            path: "/ws/config/bpmn/tmp/scripting",
            displayName: "config/bpmn/tmp/scripting",
        },
        {
            root: "/c:/ws",
            configFolder: ".camunda",
            path: "/c:/ws/.camunda/tmp/scripting",
            displayName: ".camunda/tmp/scripting",
        },
        {
            root: "C:\\ws",
            configFolder: ".camunda",
            path: "C:/ws/.camunda/tmp/scripting",
            displayName: ".camunda/tmp/scripting",
        },
        {
            root: "//server/share/repo",
            configFolder: ".camunda",
            path: "//server/share/repo/.camunda/tmp/scripting",
            displayName: ".camunda/tmp/scripting",
        },
        {
            root: "/ws/app",
            configFolder: "../shared",
            path: "/ws/shared/tmp/scripting",
            displayName: "/ws/shared/tmp/scripting",
        },
    ])(
        "$root with config folder $configFolder holds scripts in $path, named $displayName",
        ({ root, configFolder, path, displayName }) => {
            expect(workspaceScriptBaseDir(root, configFolder)).toEqual({ path, displayName });
        },
    );
});

describe("scriptGitignorePath", () => {
    it.each([
        { baseDir: "/ws/.camunda/tmp/scripting", gitignore: "/ws/.camunda/tmp/.gitignore" },
        {
            baseDir: "//server/share/repo/.camunda/tmp/scripting",
            gitignore: "//server/share/repo/.camunda/tmp/.gitignore",
        },
    ])("$baseDir is ignored by $gitignore", ({ baseDir, gitignore }) => {
        expect(scriptGitignorePath(baseDir)).toBe(gitignore);
    });
});

describe("script folders of one editor", () => {
    const editorId = "file:///ws/process.bpmn";
    const hash = ScriptUri.hashEditorId(editorId);
    const script = new ScriptUri(editorId, "Task_1", "script-task", undefined, undefined, "groovy");

    it.each([
        {
            baseDir: "/ws/.camunda/tmp/scripting",
            editorDir: `/ws/.camunda/tmp/scripting/${hash}`,
            file: `/ws/.camunda/tmp/scripting/${script.relativePath()}`,
        },
        {
            baseDir: "//server/share/repo/.camunda/tmp/scripting",
            editorDir: `//server/share/repo/.camunda/tmp/scripting/${hash}`,
            file: `//server/share/repo/.camunda/tmp/scripting/${script.relativePath()}`,
        },
    ])("keeps the editor's scripts in $editorDir", ({ baseDir, editorDir, file }) => {
        expect(editorScriptDir(baseDir, editorId)).toBe(editorDir);
        expect(scriptFilePath(baseDir, script)).toBe(file);
    });
});
