/**
 * Spanish copy for the policy documents.
 *
 * Same split as `events.es.ts`: `lib/legal.ts` holds the base document and
 * this file is the translation layered over it. Sections are keyed by their
 * English heading rather than by array position, so reordering or inserting a
 * clause in the base document cannot silently attach the wrong translation —
 * an unmatched section simply falls through to the original text.
 *
 * These are realistic drafts for a product demo, not legal advice. A
 * translated policy is a new legal text, not a convenience: have counsel
 * review both language versions before this platform takes real money.
 */
export type LegalDocCopy = {
  title: string;
  summary: string;
  updated: string;
  /** Keyed by the base document's English heading. */
  sections: Record<string, { heading: string; paragraphs: string[] }>;
};

export const LEGAL_COPY_ES: Record<string, LegalDocCopy> = {
  terms: {
    title: "Términos y condiciones",
    summary:
      "El acuerdo entre tú y Neons Running cuando usas la plataforma o te inscribes en una carrera a través de ella.",
    updated: "1 de junio de 2026",
    sections: {
      "1. Who we are": {
        heading: "1. Quiénes somos",
        paragraphs: [
          "NEONS RUNNING es operada por Neons Running LLC, registrada en San Juan, Puerto Rico. Proveemos la plataforma en la que organizadores independientes publican carreras y los corredores se inscriben en ellas.",
          "No somos el organizador de ninguna carrera, salvo que la página del evento nombre a Neons Running PR como organizador. En todos los demás eventos, el organizador indicado en la publicación es responsable de la carrera en sí.",
        ],
      },
      "2. Your account": {
        heading: "2. Tu cuenta",
        paragraphs: [
          "Debes tener 16 años o más para tener una cuenta. Las inscripciones de corredores menores las hace un padre, madre o tutor desde su propia cuenta.",
          "Guarda tus credenciales. Eres responsable de la actividad en tu cuenta hasta que nos informes de que ha sido comprometida.",
        ],
      },
      "3. Entering a race": {
        heading: "3. Inscribirse en una carrera",
        paragraphs: [
          "Una inscripción es un contrato entre tú y el organizador. Cobramos el pago en su nombre y les transmitimos tus datos para que puedan realizar el evento y cronometrarte.",
          "Las inscripciones son personales. Transferir un dorsal a otro corredor solo se permite cuando el organizador ha habilitado las transferencias en ese evento, y siempre a través de la plataforma — nunca de forma privada. Un dorsal no transferido que lleve otra persona anula el resultado y el seguro.",
          "Al pagar confirmas que estás en condiciones médicas de participar y aceptas el descargo de responsabilidad del organizador tal como se muestra durante la inscripción.",
        ],
      },
      "4. Fees": {
        heading: "4. Cargos",
        paragraphs: [
          "Los corredores pagan un cargo fijo por servicio en cada inscripción, visible en el resumen del pedido antes del pago. Los eventos gratuitos no llevan cargo.",
          "Los organizadores no pagan nada por publicar un evento. Los pagos se realizan dentro de los cinco días hábiles siguientes a la carrera, descontados los reembolsos y los contracargos.",
        ],
      },
      "5. Acceptable use": {
        heading: "5. Uso aceptable",
        paragraphs: [
          "No extraigas datos de la plataforma, no revendas inscripciones, no suplantes a otro corredor ni envíes resultados que no corriste. Eliminamos los resultados obtenidos por recortar la ruta o intercambiar dorsales, y podemos cerrar la cuenta responsable.",
        ],
      },
      "6. Liability": {
        heading: "6. Responsabilidad",
        paragraphs: [
          "Correr es una actividad física con riesgos inherentes. En la medida en que la ley lo permita, Neons Running no es responsable de lesiones, pérdidas o daños derivados de la participación en un evento publicado en la plataforma.",
          "Nada en estos términos limita la responsabilidad por fraude ni por aquello que no pueda limitarse conforme a la ley de Puerto Rico.",
        ],
      },
      "7. Changes": {
        heading: "7. Cambios",
        paragraphs: [
          "Daremos al menos 30 días de aviso por correo electrónico antes de que entre en vigor cualquier cambio sustancial a estos términos. Seguir usando la plataforma después de esa fecha significa que aceptas la revisión.",
        ],
      },
    },
  },

  privacy: {
    title: "Política de privacidad",
    summary:
      "Qué recopilamos, por qué lo necesitamos, a quién se lo damos y cómo recuperarlo o borrarlo.",
    updated: "1 de junio de 2026",
    sections: {
      "What we collect": {
        heading: "Qué recopilamos",
        paragraphs: [
          "Datos de la cuenta: tu nombre, correo, teléfono y fecha de nacimiento. La fecha de nacimiento es obligatoria porque los grupos de edad se calculan a partir de ella y la mayoría de los eventos tienen una edad mínima.",
          "Datos de inscripción: el contacto de emergencia que nos das, tu talla de camiseta, tu club y cualquier cosa que el organizador pregunte en sus propias preguntas de inscripción.",
          "Resultados: tus tiempos oficiales, parciales y posiciones. Son públicos por diseño — el resultado de una carrera es un registro publicado.",
          "Datos técnicos: páginas vistas y tipo de dispositivo, usados para mantener el servicio en funcionamiento y ver qué funciones se utilizan.",
        ],
      },
      "Why we need it": {
        heading: "Por qué lo necesitamos",
        paragraphs: [
          "Para procesar tu inscripción y darte un dorsal; para que el organizador pueda realizar la carrera con seguridad y cronometrarte; para enviarte recordatorios y resultados; y para cumplir nuestras obligaciones fiscales y contables.",
          "No vendemos tus datos, y no vendemos tu dirección de correo a patrocinadores.",
        ],
      },
      "Who it goes to": {
        heading: "A quién se lo damos",
        paragraphs: [
          "El organizador de cada carrera en la que te inscribes recibe los datos necesarios para realizar ese evento — tu nombre, edad, género, categoría, talla de camiseta y contacto de emergencia. Solo puede usarlos para ese evento.",
          "Nuestro procesador de pagos recibe lo que necesita para cobrar. Nunca almacenamos números de tarjeta completos.",
          "Los socios de cronometraje reciben tu número de dorsal y categoría para poder asociarte los resultados.",
        ],
      },
      "How long we keep it": {
        heading: "Cuánto tiempo lo conservamos",
        paragraphs: [
          "Los datos de cuenta e inscripción mientras tu cuenta esté abierta, y después 24 meses. Los registros financieros durante siete años, como exige la ley. Los resultados permanecen publicados indefinidamente, porque son un registro deportivo permanente — puedes pedirnos que desvinculemos tu nombre de ellos.",
        ],
      },
      "Your rights": {
        heading: "Tus derechos",
        paragraphs: [
          "Puedes exportar todo lo que tenemos sobre ti desde tus ajustes, y borrar tu cuenta desde esa misma pantalla. Borrarla elimina tu perfil y tus inscripciones; los resultados publicados se anonimizan en lugar de borrarse.",
          "Escribe a privacidad@neonsrunning.pr con cualquier pregunta sobre esta política.",
        ],
      },
    },
  },

  refunds: {
    title: "Política de reembolsos",
    summary:
      "Cuándo recuperas tu dinero, cuánto de él y cuánto tarda en llegar.",
    updated: "1 de junio de 2026",
    sections: {
      "The standard window": {
        heading: "El plazo estándar",
        paragraphs: [
          "Cancela con más de 14 días de antelación y se te reembolsa por completo, incluido el cargo por servicio, de forma automática desde tu perfil. Sin correos, sin formularios, sin aprobación del organizador.",
          "Dentro de los 14 días aplica la política propia del organizador. Se indica en cada página de evento antes de pagar — la mayoría ofrece un 50 % de reembolso hasta 72 horas antes, y nada después, porque las camisetas y medallas ya se pidieron contando con tu inscripción.",
        ],
      },
      "How to cancel": {
        heading: "Cómo cancelar",
        paragraphs: [
          "Abre la inscripción en tu perfil y elige Cancelar inscripción. Verás exactamente cuánto recuperas antes de confirmar.",
        ],
      },
      "When the money arrives": {
        heading: "Cuándo llega el dinero",
        paragraphs: [
          "Los reembolsos se emiten al método de pago original en un día hábil y suelen aparecer en 5–10 días hábiles, según tu banco.",
        ],
      },
      "Add-ons and donations": {
        heading: "Complementos y donaciones",
        paragraphs: [
          "Las camisetas y los paquetes de fotos se reembolsan en los mismos términos que la inscripción. Las donaciones benéficas se entregan a la organización al recibirlas y no son reembolsables.",
        ],
      },
      "Injury and illness": {
        heading: "Lesiones y enfermedad",
        paragraphs: [
          "Muchos organizadores aplazan tu inscripción a su siguiente edición en lugar de reembolsarla, incluso fuera del plazo. Contacta al organizador desde la página del evento — esa conversación es entre tú y ellos.",
        ],
      },
    },
  },

  cancellation: {
    title: "Política de cancelación de eventos",
    summary:
      "Qué pasa con tu inscripción cuando el organizador cancela, aplaza o acorta una carrera.",
    updated: "1 de junio de 2026",
    sections: {
      "If a race is cancelled": {
        heading: "Si se cancela una carrera",
        paragraphs: [
          "Cada inscripción se reembolsa por completo, incluido el cargo por servicio, dentro de un día hábil desde que se publica la cancelación. Te avisamos por correo y en la app.",
          "Los complementos se reembolsan junto con la inscripción. Las donaciones ya entregadas a la organización benéfica, no.",
        ],
      },
      "If a race is postponed": {
        heading: "Si se aplaza una carrera",
        paragraphs: [
          "Tu inscripción pasa automáticamente a la nueva fecha y se conserva tu número de dorsal. Si la nueva fecha no te sirve, tienes 14 días desde el anuncio para pedir un reembolso completo desde tu perfil.",
        ],
      },
      "Weather and safety": {
        heading: "Clima y seguridad",
        paragraphs: [
          "Las tormentas tropicales, los rayos y el calor por encima del umbral fijado por el organizador pueden acortar una ruta o mover una hora de salida con poco aviso. Una carrera que comienza y luego se detiene por seguridad cuenta como celebrada y no se reembolsa — el organizador ya incurrió en el costo.",
          "Los cambios de ruta de menos del 20 % de la distancia anunciada no dan lugar a reembolso.",
        ],
      },
      "Organizer obligations": {
        heading: "Obligaciones del organizador",
        paragraphs: [
          "Los organizadores deben publicar una cancelación dentro de las dos horas siguientes a la decisión y notificar a cada corredor inscrito a través de la plataforma. Cancelar tarde de forma reiterada es motivo para retirar a un organizador de NEONS RUNNING.",
        ],
      },
    },
  },

  "organizer-terms": {
    title: "Términos para organizadores",
    summary:
      "Lo que aceptas al publicar una carrera en NEONS RUNNING, y lo que nosotros te debemos.",
    updated: "1 de junio de 2026",
    sections: {
      "Listing an event": {
        heading: "Publicar un evento",
        paragraphs: [
          "Publicar es gratis. Te quedas con cada cuota de inscripción; los corredores pagan el cargo fijo por servicio al pagar.",
          "Tu publicación debe ser precisa sobre la distancia, la fecha, la hora de salida, la superficie de la ruta, el tiempo límite y lo que incluye la inscripción. Los cambios sustanciales deben comunicarse a los corredores inscritos a través de la plataforma, no solo en redes sociales.",
        ],
      },
      "Your responsibilities": {
        heading: "Tus responsabilidades",
        paragraphs: [
          "Tú eres el organizador de tu evento. Los permisos, los cierres de vías, los oficiales de ruta, la cobertura médica, el seguro y la seguridad de la ruta son tuyos, no nuestros.",
          "Debes contar con un seguro de responsabilidad civil adecuado al tamaño del pelotón y poder mostrarlo si se te solicita.",
        ],
      },
      "Runner data": {
        heading: "Datos de los corredores",
        paragraphs: [
          "Recibes los datos de los participantes para realizar el evento y cronometrarlo. No puedes usarlos para mercadeo ajeno a ese evento, venderlos ni conservarlos más de 24 meses después de la carrera.",
        ],
      },
      Payouts: {
        heading: "Pagos",
        paragraphs: [
          "Los fondos se liquidan dentro de los cinco días hábiles siguientes a la carrera, descontados los reembolsos, los contracargos y las donaciones adeudadas a una organización benéfica. Hay pagos parciales anticipados disponibles para eventos con más de 300 inscripciones — consúltalo con soporte.",
        ],
      },
      Results: {
        heading: "Resultados",
        paragraphs: [
          "Publica los resultados oficiales dentro de las 48 horas siguientes a la meta. Los resultados publicados en NEONS RUNNING pasan a formar parte del perfil permanente de cada corredor, así que las correcciones deben hacerse a través de la plataforma y no volviendo a subir un archivo.",
        ],
      },
      Removal: {
        heading: "Retirada",
        paragraphs: [
          "Podemos retirar una publicación que sea inexacta, insegura o se cancele de forma reiterada, y si lo hacemos reembolsaremos cada inscripción afectada.",
        ],
      },
    },
  },
};
