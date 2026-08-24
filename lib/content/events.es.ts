/**
 * Spanish copy for the event fixtures.
 *
 * The fixtures in `lib/data.ts` are the base record — the shape a real API
 * would return — and this file is the per-locale translation layered over it,
 * the same split a localized CMS uses. Nested entries are keyed by a stable
 * identifier (schedule by clock time, aid stations by kilometre, inclusions by
 * icon) rather than by array position, so reordering a fixture cannot silently
 * mismatch its translation.
 */
export type EventCopy = {
  tagline: string;
  description: string[];
  registrationCloses: string;
  statusLabel: string;
  terrain: string;
  surface: string;
  cutoff?: string;
  parking: string;
  directions: string;
  /** Keyed by the fixture's `time`. */
  schedule: Record<string, string>;
  /** Keyed by the fixture's `km`. */
  aidStations: Record<string, string>;
  /** Keyed by the fixture's `icon`. */
  included?: Record<string, { label: string; detail: string }>;
};

/** Shared by the events that use the standard inclusions list. */
const INCLUDED_STANDARD_ES: NonNullable<EventCopy["included"]> = {
  bib: { label: "Número de dorsal", detail: "Personalizado, pre-cortado" },
  chip: { label: "Chip de cronometraje", detail: "Desechable, en el dorsal" },
  medal: { label: "Medalla de meta", detail: "Brilla en la oscuridad" },
  shirt: { label: "Camiseta del evento", detail: "Técnica, XS–XXL" },
  hydration: { label: "Hidratación", detail: "4 estaciones en ruta" },
  photos: { label: "Fotos digitales", detail: "Gratis, sin marca de agua" },
};

export const EVENT_COPY_ES: Record<string, EventCopy> = {
  "neon-night-10k": {
    tagline: "Diez kilómetros de calle cerrada por el Viejo San Juan, de noche.",
    description: [
      "El Neon Night 10K se apodera del Paseo de la Princesa y de las murallas del viejo casco al caer el sol. Diez kilómetros de asfalto cerrado y llano, iluminados de principio a fin: arcos de luz en cada kilómetro, una sección de percusión en vivo en el viraje de la mitad y una meta al pie del fuerte.",
      "Cronometrado por chip en una ruta certificada con un límite de 1:45. La entrega de dorsales abre el viernes en la expo, o el mismo día desde las 4:00 p. m. en la villa de salida.",
    ],
    registrationCloses: "9 de septiembre",
    statusLabel: "Inscripción abierta",
    terrain: "Asfalto cerrado, llano",
    surface: "100 % carretera",
    parking: "Estacionamiento Covadonga, $5 fijo · 8 min a pie hasta la salida",
    directions: "Transporte gratuito desde la estación Sagrado, 5:00–5:45 p. m.",
    schedule: {
      "4:00 PM": "Abre el registro y la entrega de dorsales",
      "5:15 PM": "Calentamiento en grupo en la tarima del Paseo",
      "5:30 PM": "Salida · Media maratón",
      "6:00 PM": "Salida · 10K corral A",
      "6:10 PM": "Salida · 5K corral B",
      "7:45 PM": "Ceremonia de premiación",
      "8:30 PM": "Cierre de la ruta",
    },
    aidStations: {
      "3": "Avituallamiento 1 · La Puntilla",
      "6": "Avituallamiento 2 · Ballajá",
      "8": "Avituallamiento 3 · Del Morro",
      "10": "Meta · Explanada del fuerte",
    },
    included: INCLUDED_STANDARD_ES,
  },

  "condado-coastal-10k": {
    tagline: "Amanecer por el malecón, llano y rápido de principio a fin.",
    description: [
      "Un diez kilómetros punto a punto que bordea el malecón del Condado desde Ventana al Mar hasta Ocean Park y de vuelta. La ruta certificada más llana de la isla, y en la que la mayoría de nuestros corredores marca su mejor tiempo en 10K.",
      "Salida temprana para adelantarnos al calor. Agua cada 2,5 km y una zona de recuperación con sombra en la meta.",
    ],
    registrationCloses: "24 de septiembre",
    statusLabel: "Quedan 12 cupos",
    terrain: "Carretera costera llana",
    surface: "100 % carretera",
    parking:
      "Estacionamiento en la calle Ashford · llega antes de las 5:15 a. m.",
    directions: "La guagua T5 para a dos cuadras de la villa de salida",
    schedule: {
      "4:45 AM": "Abre el registro y la entrega de dorsales",
      "5:40 AM": "Calentamiento en grupo en Ventana al Mar",
      "6:00 AM": "Salida · 10K",
      "6:15 AM": "Salida · 5K",
      "7:30 AM": "Ceremonia de premiación",
    },
    aidStations: {
      "2.5": "Avituallamiento 1 · Ocean Park",
      "5": "Avituallamiento 2 · Viraje",
      "7.5": "Avituallamiento 3 · Ashford",
    },
    included: INCLUDED_STANDARD_ES,
  },

  "el-yunque-trail-half": {
    tagline: "Veintiún kilómetros de vereda y camino forestal en plena selva.",
    description: [
      "La media más dura de la isla. Subes 780 metros por vereda cerrada de bosque lluvioso, cruzas tres vados de río y terminas en la cresta con toda la costa norte a tus espaldas.",
      "Revisión de equipo obligatoria en la entrega de dorsales: 500 ml de agua encima, un silbato y un celular. El cupo está limitado a 240 corredores para proteger la vereda.",
    ],
    registrationCloses: "3 de octubre",
    statusLabel: "Inscripción abierta",
    terrain: "Vereda estrecha, cruces de río",
    surface: "70 % vereda · 30 % camino forestal",
    parking:
      "Estacionamiento de El Portal, gratis · se llena para las 4:30 a. m.",
    directions: "Transporte desde la plaza de Río Grande, 3:45–4:45 a. m.",
    schedule: {
      "4:15 AM": "Registro, revisión de equipo y entrega de dorsales",
      "5:15 AM": "Charla técnica obligatoria",
      "5:30 AM": "Salida · Media maratón",
      "6:00 AM": "Salida · 10K",
      "10:00 AM": "Premiación y cierre",
    },
    aidStations: {
      "5": "Avituallamiento 1 · Juan Diego",
      "11": "Avituallamiento 2 · La cresta",
      "17": "Avituallamiento 3 · Último vado",
    },
    included: {
      bib: { label: "Número de dorsal", detail: "Impermeable, para vereda" },
      chip: {
        label: "Chip de cronometraje",
        detail: "Correa de tobillo, se devuelve",
      },
      medal: {
        label: "Medalla de meta",
        detail: "Tallada en madera de tabonuco",
      },
      shirt: {
        label: "Camiseta del evento",
        detail: "Mezcla de merino, XS–XXL",
      },
      hydration: { label: "Hidratación", detail: "3 estaciones, sin vasos" },
      photos: { label: "Fotos digitales", detail: "Gratis, sin marca de agua" },
    },
  },

  "vieques-sunrise-marathon": {
    tagline: "Una maratón completa en una isla con más caballos que carros.",
    description: [
      "Cuarenta y dos kilómetros alrededor de Vieques, saliendo de noche desde Esperanza y terminando sobre la arena de Sun Bay. Carretera costera ondulada, casi sin tráfico, y un amanecer en el kilómetro ocho del que los corredores hablan por años.",
      "La inscripción incluye el cruce en lancha desde Ceiba el fin de semana de la carrera. El cupo está limitado a 200.",
    ],
    registrationCloses: "25 de octubre",
    statusLabel: "Precio de preventa",
    terrain: "Carretera costera ondulada",
    surface: "100 % carretera",
    parking: "Deja el carro en Ceiba — la lancha va incluida con la inscripción",
    directions: "La lancha de la carrera sale de Ceiba el sábado a las 6:00 p. m.",
    schedule: {
      "3:30 AM": "Abre el registro en el Malecón",
      "4:40 AM": "Charla técnica",
      "5:00 AM": "Salida · Maratón",
      "5:30 AM": "Salida · Media maratón",
      "11:30 AM": "Premiación en la arena",
    },
    aidStations: {
      "7": "Avituallamiento 1 · Mosquito Pier",
      "14": "Avituallamiento 2 · Isabel II",
      "21": "Avituallamiento 3 · Paso de la media",
      "30": "Avituallamiento 4 · La Chata",
      "37": "Avituallamiento 5 · Portón de Sun Bay",
    },
    included: INCLUDED_STANDARD_ES,
  },

  "luquillo-beach-fun-run": {
    tagline: "Tres kilómetros sobre la arena. Bienvenidos coches, perros y niños.",
    description: [
      "La carrera menos seria que organizamos, y la más grande. Tres kilómetros por el Balneario Monserrate con la marea baja, sin cronometraje, con una milla infantil que sale quince minutos antes.",
      "Cada inscripción financia una temporada de atletismo juvenil en el club municipal de Luquillo.",
    ],
    registrationCloses: "19 de noviembre",
    statusLabel: "Inscripción abierta",
    terrain: "Arena compacta",
    surface: "100 % playa",
    cutoff: "Sin límite",
    parking: "Estacionamiento del balneario, $4 por carro",
    directions: "PR-3 hacia el este, salida en el km 35.4",
    schedule: {
      "6:00 AM": "Abre el registro en el Kiosko 12",
      "6:45 AM": "Salida de la milla infantil",
      "7:00 AM": "Salida del 3K",
      "8:00 AM": "Desayuno en la playa y rifa",
    },
    aidStations: {
      "1.5": "Avituallamiento 1 · Viraje",
    },
    included: {
      bib: { label: "Número de dorsal", detail: "Los nenes pueden colorearlo" },
      medal: {
        label: "Medalla de meta",
        detail: "Para cada corredor, de cualquier edad",
      },
      shirt: {
        label: "Camiseta del evento",
        detail: "Algodón, también en tallas juveniles",
      },
      hydration: { label: "Hidratación", detail: "Salida y meta" },
      photos: { label: "Fotos digitales", detail: "Gratis, sin marca de agua" },
    },
  },

  "ponce-track-night-5k": {
    tagline: "Doce vueltas y media bajo las luces. Contrarreloj puro.",
    description: [
      "Un 5K de estadio en la pista municipal de Ponce, con series por tiempo inscrito. Conteo de vueltas, reloj de ritmo en vivo en el terreno interior y un pelotón que vino a correr un número.",
      "Somete un 5K reciente o un tiempo estimado al inscribirte — las series se publican la noche antes.",
    ],
    registrationCloses: "21 de octubre",
    statusLabel: "Abre el 15 de septiembre",
    terrain: "Pista de mondo",
    surface: "100 % pista",
    parking: "Estacionamiento del estadio, gratis",
    directions: "PR-2 hasta la Av. Las Américas, entrada C",
    schedule: {
      "6:30 PM": "Abre el registro y la pista de calentamiento",
      "7:30 PM": "Serie 1 · bajo 18:00",
      "8:05 PM": "Serie 2 · 18:00–22:00",
      "8:45 PM": "Serie 3 · abierta",
      "9:30 PM": "Publicación de resultados",
    },
    aidStations: {
      "2.5": "Mesa del terreno interior",
    },
    included: {
      bib: { label: "Número de dorsal", detail: "Serie y carril impresos" },
      chip: {
        label: "Chip de cronometraje",
        detail: "Parciales vuelta a vuelta",
      },
      medal: { label: "Medalla de meta", detail: "Solo ganadores de serie" },
      hydration: {
        label: "Hidratación",
        detail: "Mesa en el terreno interior",
      },
      photos: { label: "Fotos digitales", detail: "Gratis, sin marca de agua" },
    },
  },
};
