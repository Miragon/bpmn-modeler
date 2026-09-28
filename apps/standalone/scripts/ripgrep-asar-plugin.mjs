const ripgrepModule = /[/\\]@vscode[/\\]ripgrep[/\\]lib[/\\]index\.js$/;

export const ripgrepAsarPlugin = {
    name: "ripgrep-asar-path",
    setup(build) {
        build.onLoad({ filter: ripgrepModule }, () => ({
            contents: `export const rgPath = require('path')
                .join(__dirname, 'native', process.platform === 'win32' ? 'rg.exe' : 'rg')
                .replace(/([\\\\/])app\\.asar(?=[\\\\/])/, '$1app.asar.unpacked');`,
            loader: "js",
        }));
    },
};
