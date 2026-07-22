import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SignatureStudio from "../app/SignatureStudio";
import "../app/globals.css";
import "../app/studio-v1.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Signature Studio root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <SignatureStudio />
  </StrictMode>,
);
