declare const cases: {
    folders: { configFolder: string; folder: string }[];
    files: {
        name: string;
        path: string;
        configFolder: string;
        text: string;
        isTemplate: boolean;
    }[];
};
export default cases;
