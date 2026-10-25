import MiragonTheme from "../miragon/theme";
import DownloadPage from "./components/DownloadPage.vue";
import HomeLanding from "./components/HomeLanding.vue";
import "./custom.css";

export default {
    extends: MiragonTheme,
    enhanceApp({ app }) {
        app.component("HomeLanding", HomeLanding);
        app.component("DownloadPage", DownloadPage);
    },
};
