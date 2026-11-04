import { montarVista } from "../domains/resultados/resultados-view.js";
import { onINP } from "web-vitals";

onINP((m) => {
  const el = document.getElementById("inp");
  if (el) el.textContent = `INP: ${Math.round(m.value)} ms`;
  // RT-9: reportar bajo carga en gama baja / CPU throttling 6x.
  console.info("[rt-9] INP", m.value);
});

montarVista("dep", (document.getElementById("topic") as HTMLSelectElement | null)?.value ?? "mun:11");
