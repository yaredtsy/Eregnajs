import { createRoot } from "react-dom/client";
import { ToolCallCardFixturePage } from "./components/chat/fixtures/ToolCallCard.fixture.js";
import "./widget.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<ToolCallCardFixturePage />);
}
