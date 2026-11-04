// Spanish UI copy for the public results screen.
// Single source of component strings; no hardcoded text in views.
const int = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function scopeName(topic: string): string {
  if (topic === "dep") return "Departamento";
  const [kind, n] = topic.split(":");
  if (kind === "mun") return `Municipio ${n}`;
  if (kind === "puesto") return `Puesto ${n}`;
  return topic;
}

export const es = {
  brand: "Preconteo",
  title: "Resultados del preconteo",
  scopeLabel: "Ámbito",
  scopeNote: "Dos conexiones en vivo: departamento y ámbito elegido.",
  catalog: {
    municipality: "Municipio",
    station: "Puesto",
    allDepartments: "Todo el departamento",
    allStations: "Todos los puestos",
    error: "No se pudo cargar el catálogo territorial.",
  },
  freshness: (reported: number, total: number, time: string): string =>
    `Informe rápido, no oficial · ${int.format(reported)} de ${int.format(total)} mesas · ${time}`,
  kpis: {
    reported: "Mesas informadas",
    progress: "Avance",
    voters: "Sufragantes",
    updated: "Actualizado",
  },
  ranking: {
    title: "Votos por candidatura",
    caption: "Acumulado del ámbito · valores absolutos en cada envío",
  },
  corrections: {
    title: "Correcciones",
    empty: "Sin correcciones en este ámbito.",
    waiting: "Esperando datos en vivo…",
    corrected: (record: string, from: number, to: number): string =>
      `${record} fue corregida, versión ${from} a ${to}.`,
  },
  tableLookup: {
    title: "Mesa",
    label: "Número de mesa",
    action: "Ver",
    loading: "cargando…",
    error: "No se pudo cargar la mesa.",
    invalid: "Mesa inválida (1–6400).",
    retry: "Reintentar",
    reported: "Informada",
    notReported: "Sin informar",
    fields: {
      table: "Mesa",
      station: "Puesto",
      municipality: "Municipio",
      voters: "Sufragantes",
    },
  },
  connection: {
    title: "Conexión",
    connecting: "conectando…",
    live: "en vivo",
    reconnecting: "reconectando…",
    pausedPrefix: "Datos en pausa, última actualización",
    note: "Reconexión con retroceso exponencial y reanudación desde el último mensaje.",
    inpPending: "INP …",
    inp: (ms: number): string => `INP: ${ms} ms`,
    instance: (id: string): string => `instancia ${id}`,
    offline: (scope: string): string => `Sin conexión con ${scope}.`,
  },
  formatInt: (n: number): string => int.format(n),
};

export type Strings = typeof es;
