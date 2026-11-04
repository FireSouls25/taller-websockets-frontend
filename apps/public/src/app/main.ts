import { mountView } from "../domains/results/results-view.js";
import { es } from "../i18n/es.js";
import { onINP } from "web-vitals";

onINP((m) => {
  const el = document.getElementById("inp-note");
  if (el) el.textContent = es.connection.inp(Math.round(m.value));
  // RT-9: report under load on low-end / 6x CPU throttling.
  console.info("[rt-9] INP", m.value);
});

mountView();
