import { render } from "preact";
import { detectLanguage, setLanguage } from "./i18n";
import { App } from "./ui/App";
import "./ui/styles.css";

setLanguage(detectLanguage(navigator.language));

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root element");
}
render(<App />, root);
