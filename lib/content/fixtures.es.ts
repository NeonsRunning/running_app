/**
 * Spanish copy for the non-event fixtures — organizers, runner profiles,
 * notifications, clubs and the community feed.
 *
 * Same split as `events.es.ts`: `lib/data.ts` holds the base record and this
 * file is the translation layered over it, keyed by the fixture's stable id.
 * Names, handles, bib numbers and times are identity, not copy, so they are
 * absent here and pass through untouched.
 */

export const ORGANIZER_BLURB_ES: Record<string, string> = {
  "neons-pr":
    "Organizando carreras nocturnas por toda la isla desde 2019. Rutas cerradas, cronometraje por chip en todas las distancias y una línea de salida que se siente como una fiesta de barrio.",
  "yunque-trails":
    "Carreras de bosque lluvioso y cresta en el noreste. Pelotones pequeños, mucho desnivel y una regla: todo corredor baja de la montaña antes del anochecer.",
  "costa-club":
    "Un club comunitario convertido en serie de carreras. Salidas en la playa, corrales familiares y recaudos que se quedan en la costa norte.",
};

export const RUNNER_BIO_ES: Record<string, string> = {
  "alex-rivera":
    "Especialista en carreras nocturnas. Persiguiendo un 10K bajo 45 antes de que acabe el año. Café a las 4:30 a. m., a la calle a las 5.",
};

/** Keyed by achievement id. */
export const ACHIEVEMENT_ES: Record<string, { name: string; detail: string }> = {
  "first-5k": { name: "Primer 5K", detail: "mar 2025" },
  streak: { name: "Racha de 5 carreras", detail: "jul 2025" },
  sub25: { name: "5K bajo 25", detail: "Nuevo · ago 2026" },
  "100km": { name: "Club de 100 KM", detail: "faltan 21,6 km" },
  night: { name: "Corredor nocturno", detail: "6 carreras nocturnas" },
  podium: { name: "Podio", detail: "3.º · Luquillo 5K" },
};

/** Keyed by achievement id — the month stamp shown once earned. */
export const ACHIEVEMENT_EARNED_ON_ES: Record<string, string> = {
  "first-5k": "mar 2025",
  streak: "jul 2025",
  sub25: "ago 2026",
  night: "jun 2026",
  podium: "mar 2026",
};

/** Keyed by notification id. */
export const NOTIFICATION_ES: Record<
  string,
  { title: string; body: string; time: string }
> = {
  n1: {
    title: "Recordatorio de carrera",
    body: "Tu Neon Night 10K empieza en 3 días. La entrega de dorsales abre el viernes en la expo.",
    time: "hace 2 h",
  },
  n2: {
    title: "Actualización del evento",
    body: "Neon Night 10K: la villa de salida se movió una cuadra al oeste, al portón 2 del Paseo de la Princesa.",
    time: "Ayer",
  },
  n3: {
    title: "Inscripción confirmada",
    body: "Ya estás inscrito oficialmente en el Neon Night 10K. Dorsal n.º 1048, corral A.",
    time: "12 ago",
  },
  n4: {
    title: "Resultados disponibles",
    body: "Ya se publicó tu resultado oficial del Condado Coastal 10K: 51:04, una nueva marca personal.",
    time: "25 may",
  },
  n5: {
    title: "Marisol Rivera te siguió",
    body: "Ahora tienes 418 seguidores en NEONS RUNNING.",
    time: "20 may",
  },
};

/** Keyed by club id. */
export const CLUB_FOCUS_ES: Record<string, string> = {
  nocturnos: "Ruta nocturna",
  costa: "Playa y malecón",
  yunque: "Vereda técnica",
  sur: "Pista y trabajo de velocidad",
};

/** Keyed by feed item id. */
export const COMMUNITY_FEED_ES: Record<string, { text: string; time: string }> =
  {
    f1: {
      text: "completó su primera media maratón en el Old San Juan Half.",
      time: "hace 3 h",
    },
    f2: {
      text: "estableció una nueva marca personal en 5K: 21:42.",
      time: "hace 6 h",
    },
    f3: {
      text: "quedó 2.ª en la general del Condado Coastal 10K.",
      time: "Ayer",
    },
    f4: {
      text: "se unió a Neons Nocturnos y registró su sexta carrera nocturna.",
      time: "hace 2 d",
    },
  };

/** Month abbreviations used in the fixture date stamps ("12 JUL 2026"). */
const MONTH_ES: Record<string, string> = {
  JAN: "ENE",
  FEB: "FEB",
  MAR: "MAR",
  APR: "ABR",
  MAY: "MAY",
  JUN: "JUN",
  JUL: "JUL",
  AUG: "AGO",
  SEP: "SEP",
  OCT: "OCT",
  NOV: "NOV",
  DEC: "DIC",
};

/**
 * Translate the month inside a fixture date stamp, in either the uppercase
 * form used by results ("12 JUL 2026") or the title case used by participant
 * lists ("12 Aug 2026").
 */
export function localizeDateStamp(stamp: string): string {
  return stamp.replace(/\b([A-Za-z]{3})\b/g, (match) => {
    const translated = MONTH_ES[match.toUpperCase()];
    if (!translated) return match;
    // Preserve the original casing convention of the stamp.
    return match === match.toUpperCase()
      ? translated
      : translated.charAt(0) + translated.slice(1).toLowerCase();
  });
}

/** Pace strings read "4:55 / km" in both languages; only the unit differs. */
export const PACE_UNIT_ES = "min/km";
