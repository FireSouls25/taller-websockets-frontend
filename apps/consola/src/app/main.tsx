import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const raiz = document.getElementById("raiz");
if (!raiz) throw new Error("falta #raiz");
createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
