import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";
import { applyTheme, initialTheme } from "./ui";

applyTheme(initialTheme());
createApp(App).mount("#app");
