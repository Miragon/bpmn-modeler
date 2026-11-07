import { describeClipboardContract } from "./clipboardContract";
import { InMemoryClipboard } from "./inMemoryHostSurfaces";

describeClipboardContract("InMemoryClipboard", async () => {
    const clipboard = new InMemoryClipboard();
    return {
        clipboard,
        copyElsewhere: async (text) => {
            clipboard.text = text;
        },
        pasteElsewhere: async () => clipboard.text,
    };
});
