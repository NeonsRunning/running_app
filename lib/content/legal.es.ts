/**
 * Spanish copy for the policy documents.
 *
 * Same split as `fixtures.es.ts`: `lib/legal.ts` holds the base document and
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
    title: "Términos y condiciones de uso y participación",
    summary:
      "Bienvenidos a NEONS RUNNING. Al acceder a nuestra página, registrarse en nuestros eventos, participar en nuestras carreras o adquirir alguno de nuestros productos o servicios, usted acepta los siguientes Términos y Condiciones. Le recomendamos leer este documento detenidamente antes de realizar una inscripción o compra.",
    updated: "22 de octubre de 2026",
    sections: {
      "1. About NEONS RUNNING": {
        heading: "1. Sobre NEONS RUNNING",
        paragraphs: [
          "NEONS RUNNING es una página dedicada a promover el running, la actividad física, los retos deportivos y la participación en eventos presenciales y virtuales. Las actividades pueden incluir carreras 5K y 10K, retos virtuales, entrega de medallas, certificados de participación y otras iniciativas deportivas.",
          "Las condiciones específicas de cada evento se anunciarán en su respectiva promoción o formulario de inscripción.",
        ],
      },
      "2. Registration": {
        heading: "2. Inscripciones y registro",
        paragraphs: [
          "Cada participante deberá proporcionar información correcta, completa y actualizada al momento de inscribirse.",
          "La inscripción se considerará completada una vez se cumplan los requisitos indicados para el evento, incluyendo el pago cuando corresponda.",
          "Cada participante es responsable de verificar los detalles de su inscripción, las fechas, los costos, las instrucciones y los requisitos de participación.",
          "NEONS RUNNING se reserva el derecho de rechazar o cancelar inscripciones por información falsa, incumplimiento de las reglas o circunstancias justificadas, de conformidad con la legislación aplicable.",
          "La inscripción es personal y no podrá transferirse a otra persona sin autorización previa de la organización.",
        ],
      },
      "3. Costs and payments": {
        heading: "3. Costos y pagos",
        paragraphs: [
          "Los costos de inscripción, productos, medallas, certificados y otros servicios se informarán en la promoción correspondiente.",
          "Los participantes deberán completar el pago conforme a las instrucciones publicadas.",
          "Cualquier cargo adicional aplicable deberá informarse antes de completar la transacción.",
          "El comprobante de pago deberá conservarse como evidencia de la transacción.",
          "Los pagos no serán reembolsables automáticamente por el simple hecho de que un participante decida no participar. La elegibilidad para reembolsos estará sujeta a la política anunciada para el evento y a las leyes aplicables.",
          "Si NEONS RUNNING cancela un evento, se aplicará la política de cancelación y reembolso comunicada para dicho evento, respetando los derechos que correspondan al consumidor.",
        ],
      },
      "4. Virtual races and challenges": {
        heading: "4. Carreras y retos virtuales",
        paragraphs: [
          "En las carreras virtuales, cada participante podrá completar la distancia establecida dentro del período anunciado para el evento, siguiendo las instrucciones oficiales.",
          "El participante será responsable de: seleccionar una ruta apropiada y segura; cumplir con las leyes de tránsito y las normas del lugar donde realice la actividad; utilizar vestimenta, calzado y equipo adecuados; mantenerse hidratado y evaluar las condiciones del clima; completar la distancia y presentar evidencia de participación cuando el evento lo requiera; y enviar los resultados dentro del plazo establecido.",
          "NEONS RUNNING podrá establecer requisitos específicos para validar los resultados, incluyendo capturas de aplicaciones deportivas, registros de distancia, fotografías u otra evidencia razonable.",
          "La presentación de información falsa o alterada podrá resultar en la descalificación del participante.",
        ],
      },
      "5. Health, safety and disclaimer": {
        heading: "5. Salud, seguridad y descargo de responsabilidad",
        paragraphs: [
          "La participación en actividades deportivas implica riesgos inherentes, incluyendo lesiones, caídas, agotamiento, deshidratación y accidentes.",
          "Cada participante reconoce que es responsable de evaluar su condición física, tomar las precauciones necesarias y buscar orientación médica cuando corresponda.",
          "En eventos virtuales, el participante asume la responsabilidad de elegir una ruta segura y realizar la actividad bajo condiciones apropiadas.",
          "En la medida permitida por la ley, NEONS RUNNING no será responsable por riesgos inherentes a la participación que no sean atribuibles a una conducta por la cual corresponda responsabilidad legal. Nada en estos términos excluye responsabilidades o derechos que legalmente no puedan excluirse.",
          "La aceptación de estos términos no sustituye el descargo de responsabilidad específico que pueda requerirse para un evento.",
        ],
      },
      "6. Medals, certificates and merchandise": {
        heading: "6. Medallas, certificados y artículos",
        paragraphs: [
          "Cuando un evento incluya medallas, certificados u otros artículos, la promoción indicará los productos incluidos y las condiciones de entrega.",
          "Los artículos se entregarán de acuerdo con el calendario, método y lugar anunciados.",
          "Las fechas de entrega podrán ajustarse por causas logísticas o circunstancias fuera del control razonable de la organización. Cualquier cambio significativo será comunicado a los participantes.",
          "Los participantes deberán proporcionar información correcta para la entrega o envío.",
          "Los gastos de envío, si aplican, se comunicarán antes de completar la compra.",
          "Los errores de fabricación, artículos dañados o entregas incorrectas deberán notificarse a la organización para evaluar una solución razonable conforme a la política aplicable y las leyes vigentes.",
        ],
      },
      "7. Changes, postponements and cancellations": {
        heading: "7. Cambios, aplazamientos y cancelaciones",
        paragraphs: [
          "NEONS RUNNING podrá modificar horarios, rutas, lugares, fechas o procedimientos cuando resulte necesario por razones de seguridad, clima, logística, disponibilidad de materiales u otras circunstancias justificadas.",
          "Cuando ocurra un cambio importante, se procurará notificar a los participantes mediante los canales oficiales disponibles.",
          "Si un evento se aplaza o cancela, las alternativas aplicables —incluyendo reprogramación, crédito o reembolso cuando corresponda— se comunicarán de acuerdo con la política específica del evento y la legislación aplicable.",
        ],
      },
      "8. Participant conduct": {
        heading: "8. Conducta de los participantes",
        paragraphs: [
          "Todos los participantes deberán mantener una conducta respetuosa hacia los organizadores, voluntarios, otros corredores y miembros de la comunidad.",
          "No se permitirá: acoso, amenazas, discriminación o comportamiento abusivo; presentación deliberada de resultados falsos; uso indebido de la marca o suplantación de representantes de NEONS RUNNING; ni el incumplimiento de instrucciones de seguridad o de las reglas oficiales del evento.",
          "Las infracciones podrán dar lugar a la descalificación o restricción de participación, según la gravedad de la situación y la legislación aplicable.",
        ],
      },
      "9. Intellectual property and use of the brand": {
        heading: "9. Propiedad intelectual y uso de la marca",
        paragraphs: [
          "El nombre NEONS RUNNING, sus logotipos, diseños originales, promociones, fotografías oficiales, gráficos y materiales publicados pertenecen a sus respectivos titulares o se utilizan con autorización.",
          "No se permite copiar, modificar, distribuir, comercializar o utilizar estos materiales de forma que infrinja derechos de propiedad intelectual o sugiera una afiliación no autorizada.",
          "Los participantes podrán compartir las publicaciones de NEONS RUNNING en redes sociales de manera legítima, respetando la integridad del contenido y los derechos correspondientes.",
        ],
      },
      "10. Photos, videos and publications": {
        heading: "10. Fotografías, videos y publicaciones",
        paragraphs: [
          "Durante algunos eventos podrán tomarse fotografías o videos con fines informativos, deportivos o promocionales.",
          "Cualquier uso promocional de imágenes identificables de participantes estará sujeto a las autorizaciones necesarias y a la legislación aplicable, especialmente cuando se trate de menores de edad.",
          "Cuando corresponda, NEONS RUNNING solicitará el consentimiento por separado. La participación en un evento no debe interpretarse, por sí sola, como una autorización ilimitada para utilizar la imagen de una persona.",
        ],
      },
      "11. Privacy and data protection": {
        heading: "11. Privacidad y protección de datos",
        paragraphs: [
          "NEONS RUNNING podrá recopilar los datos necesarios para gestionar inscripciones, confirmar pagos, validar resultados, coordinar entregas y comunicarse con los participantes.",
          "La información personal se utilizará para los fines informados al momento de recopilarla y se manejará conforme a la legislación aplicable.",
          "No se deberá publicar información personal de otros participantes sin autorización. Los participantes podrán solicitar información sobre el tratamiento de sus datos a través de los canales oficiales de contacto.",
          "Los datos de pago deberán procesarse mediante métodos apropiados y no deberán compartirse públicamente.",
        ],
      },
      "12. Minors": {
        heading: "12. Menores de edad",
        paragraphs: [
          "Los participantes menores de 18 años deberán contar con la autorización de su padre, madre o tutor legal cuando corresponda.",
          "La organización podrá establecer requisitos adicionales de supervisión, seguridad y documentación para la participación de menores.",
          "Las autorizaciones deberán obtenerse antes de la participación y no eliminarán los derechos legales del menor ni las obligaciones que correspondan a la organización.",
        ],
      },
      "13. Official communications": {
        heading: "13. Comunicaciones oficiales",
        paragraphs: [
          "Las actualizaciones, instrucciones, anuncios y cambios de los eventos se publicarán a través de los canales oficiales de NEONS RUNNING.",
          "Cada participante será responsable de revisar la información relacionada con su inscripción y de mantener actualizados sus medios de contacto.",
          "NEONS RUNNING no se hace responsable por mensajes enviados por cuentas no oficiales que se hagan pasar por representantes de la organización.",
        ],
      },
      "14. Changes to these terms": {
        heading: "14. Modificaciones a estos términos",
        paragraphs: [
          "NEONS RUNNING podrá actualizar estos Términos y Condiciones cuando sea necesario.",
          "Las modificaciones se publicarán en la página con la fecha de actualización correspondiente. Los cambios materiales relacionados con una inscripción ya realizada se manejarán de conformidad con la legislación aplicable y las condiciones contractuales pertinentes.",
        ],
      },
      "15. Governing law": {
        heading: "15. Legislación aplicable",
        paragraphs: [
          "Estos Términos y Condiciones se interpretarán conforme a las leyes aplicables de Puerto Rico y, cuando corresponda, a las leyes federales de Estados Unidos.",
          "Ninguna disposición de este documento pretende limitar derechos legales irrenunciables de los participantes o consumidores.",
        ],
      },
      "16. Acceptance of the terms": {
        heading: "16. Aceptación de los términos",
        paragraphs: [
          "Al utilizar los servicios de NEONS RUNNING, completar una inscripción o adquirir un producto, el participante reconoce que ha tenido la oportunidad de leer estos Términos y Condiciones.",
          "Cuando se requiera aceptación expresa, esta se solicitará mediante el mecanismo correspondiente antes de completar la inscripción o transacción.",
          "Contacto oficial: neonsmultiservicesllc@gmail.com · Página oficial: neonsrunning.com",
          "NEONS RUNNING — Corre con pasión. Supera tus límites. Deja tu huella.",
        ],
      },
    },
  },

  waiver: {
    title: "Descargo de responsabilidad y aceptación de riesgos",
    summary:
      "Al registrarme, participar o inscribirme en cualquier evento, carrera presencial o virtual, reto deportivo o actividad organizada, promovida o auspiciada por NEONS RUNNING, reconozco y acepto lo siguiente:",
    updated: "23 de octubre de 2026",
    sections: {
      "1. Voluntary participation and risks": {
        heading: "1. Participación voluntaria y riesgos",
        paragraphs: [
          "Entiendo que participar en actividades de running, caminatas y eventos deportivos conlleva riesgos inherentes, incluyendo, entre otros, caídas, lesiones, accidentes, deshidratación, agotamiento, condiciones climáticas adversas y otras situaciones que pudieran afectar mi salud o seguridad.",
        ],
      },
      "2. Physical condition and health": {
        heading: "2. Condición física y salud",
        paragraphs: [
          "Declaro que soy responsable de evaluar mi condición física y de consultar con un profesional de la salud cuando sea necesario antes de participar. Certifico que participaré según mis capacidades y que detendré la actividad si experimento síntomas o condiciones que puedan poner en riesgo mi bienestar.",
        ],
      },
      "3. Personal responsibility": {
        heading: "3. Responsabilidad personal",
        paragraphs: [
          "Acepto que soy responsable de mi conducta, mis pertenencias, mi preparación física y el cumplimiento de las instrucciones de seguridad aplicables durante la actividad.",
        ],
      },
      "4. Release of liability": {
        heading: "4. Liberación de responsabilidad",
        paragraphs: [
          "En la medida permitida por las leyes aplicables, libero a NEONS RUNNING, sus organizadores, representantes, colaboradores, voluntarios y auspiciadores de reclamaciones por lesiones, pérdidas o daños relacionados con mi participación, excepto cuando la responsabilidad no pueda excluirse legalmente, incluyendo los casos que correspondan por negligencia u otras causas conforme a la ley.",
        ],
      },
      "5. Virtual events": {
        heading: "5. Eventos virtuales",
        paragraphs: [
          "Si participo en una carrera o reto virtual, reconozco que soy responsable de seleccionar una ruta segura, verificar las condiciones del lugar, respetar las leyes de tránsito y tomar las precauciones necesarias durante la actividad.",
        ],
      },
      "6. Minors": {
        heading: "6. Menores de edad",
        paragraphs: [
          "La participación de menores requerirá la autorización de su padre, madre o tutor legal, quien deberá aceptar las condiciones correspondientes y asumir las responsabilidades que legalmente le correspondan.",
        ],
      },
      "7. Emergencies": {
        heading: "7. Emergencias",
        paragraphs: [
          "Autorizo la solicitud de asistencia médica de emergencia cuando resulte razonablemente necesaria durante una actividad, reconociendo que cualquier servicio médico estará sujeto a sus propios términos y costos aplicables.",
        ],
      },
      "8. Acceptance": {
        heading: "8. Aceptación",
        paragraphs: [
          "Declaro que he leído y comprendido este documento, que participo voluntariamente y que acepto sus términos. Entiendo que este descargo no elimina los derechos que me correspondan bajo las leyes aplicables.",
          "NEONS RUNNING — Corre con pasión, supera tus límites y disfruta cada kilómetro con responsabilidad.",
        ],
      },
    },
  },
  privacy: {
    title: "Política de privacidad y protección de datos",
    summary:
      "En NEONS RUNNING, respetamos la privacidad de nuestros participantes, clientes y visitantes. Nos comprometemos a manejar la información personal de manera responsable, transparente y segura. Esta Política de Privacidad explica qué información podemos recopilar, cómo la utilizamos, en qué circunstancias podemos compartirla y qué opciones tienen las personas respecto a sus datos cuando visitan nuestra página, se inscriben en eventos, participan en carreras virtuales o adquieren nuestros productos y servicios.",
    updated: "22 de octubre de 2026",
    sections: {
      "1. Information we collect": {
        heading: "1. Información que recopilamos",
        paragraphs: [
          "Dependiendo de la actividad o del servicio solicitado, NEONS RUNNING podrá recopilar los siguientes datos:",
          "Información personal: nombre y apellidos.",
          "Información de contacto: correo electrónico, número de teléfono y dirección postal cuando sea necesaria para realizar una entrega.",
          "Información de inscripción: evento seleccionado, distancia, número de participante y estado de la inscripción.",
          "Información deportiva: distancia completada, tiempo registrado, resultados y evidencia de participación cuando sea requerida para validar un reto.",
          "Información de pago: confirmación de la transacción y datos necesarios para verificar el pago. Los datos completos de tarjetas u otros instrumentos de pago deberán procesarse mediante proveedores de pago apropiados y no se solicitarán públicamente.",
          "Comunicaciones: mensajes, consultas y solicitudes relacionadas con nuestras actividades.",
          "Información técnica: determinados datos de navegación o uso, si la plataforma utilizada los recopila mediante sus propias herramientas o tecnologías similares.",
          "Recopilaremos únicamente la información razonablemente necesaria para los fines informados.",
        ],
      },
      "2. How we use the information": {
        heading: "2. Cómo utilizamos la información",
        paragraphs: [
          "La información personal podrá utilizarse para: procesar y administrar inscripciones; confirmar pagos y compras; coordinar la participación en carreras y retos virtuales; verificar resultados y evidencias deportivas; organizar la preparación y entrega de medallas, certificados y otros artículos; enviar confirmaciones, instrucciones, actualizaciones y avisos sobre eventos; atender preguntas, reclamaciones y solicitudes de servicio; prevenir transacciones fraudulentas y el uso indebido de nuestros servicios; cumplir con obligaciones legales aplicables; y enviar promociones o comunicaciones comerciales cuando corresponda y de acuerdo con las preferencias y autorizaciones necesarias.",
          "NEONS RUNNING no utilizará los datos para fines incompatibles con los informados sin la autorización correspondiente o sin otra base legal válida.",
        ],
      },
      "3. Sharing information with third parties": {
        heading: "3. Compartir información con terceros",
        paragraphs: [
          "NEONS RUNNING no vende la información personal de sus participantes.",
          "Podremos compartir los datos estrictamente necesarios con terceros cuando sea indispensable para prestar nuestros servicios, por ejemplo: plataformas utilizadas para gestionar inscripciones; procesadores de pago; empresas de mensajería y servicios postales; proveedores de alojamiento web, formularios y herramientas tecnológicas; y profesionales o autoridades cuando exista una obligación legal válida.",
          "Estos terceros podrán procesar información de acuerdo con sus propias políticas, contratos y obligaciones legales.",
          "Solo se compartirá la información pertinente para el propósito correspondiente, procurando mantener medidas razonables de protección.",
        ],
      },
      "4. Photos, videos and social media": {
        heading: "4. Fotografías, videos y redes sociales",
        paragraphs: [
          "Durante nuestros eventos podrán tomarse fotografías y videos para documentar las actividades deportivas.",
          "La publicación de imágenes identificables de participantes con fines promocionales se realizará cuando exista la autorización o base legal necesaria. Cuando corresponda, solicitaremos consentimiento específico.",
          "La participación en una carrera no constituye, por sí sola, una autorización ilimitada para publicar o comercializar la imagen de una persona.",
          "Los participantes no deberán publicar información personal de otros corredores sin la debida autorización.",
          "Las fotografías, videos y publicaciones compartidos directamente por usuarios en redes sociales también pueden estar sujetos a las políticas de esas plataformas.",
        ],
      },
      "5. Privacy in virtual races": {
        heading: "5. Privacidad en carreras virtuales",
        paragraphs: [
          "Para validar la participación en un reto virtual, NEONS RUNNING podrá solicitar evidencia como capturas de pantalla de aplicaciones deportivas, registros de distancia, tiempos o fotografías relacionadas con la actividad.",
          "Recomendamos ocultar información que no sea necesaria para verificar el resultado, como direcciones particulares, datos de acceso, información financiera u otros datos sensibles.",
          "No solicitamos contraseñas de cuentas personales de aplicaciones deportivas para validar una carrera.",
          "Los resultados que se publiquen públicamente se limitarán a la información pertinente para el evento y a los usos informados a los participantes.",
        ],
      },
      "6. Data security and retention": {
        heading: "6. Seguridad y conservación de los datos",
        paragraphs: [
          "NEONS RUNNING adoptará medidas administrativas, técnicas y organizativas razonables para proteger la información contra accesos no autorizados, divulgación, pérdida, alteración o uso indebido.",
          "El acceso a los datos deberá limitarse a las personas que los necesiten para realizar tareas autorizadas.",
          "Conservaremos la información durante el tiempo necesario para administrar las inscripciones, atender reclamaciones, cumplir obligaciones legales y mantener los registros legítimamente requeridos. Posteriormente, los datos podrán eliminarse o anonimizarse cuando corresponda.",
          "Ningún sistema de transmisión o almacenamiento de información puede garantizar seguridad absoluta.",
        ],
      },
      "7. Cookies and similar technologies": {
        heading: "7. Cookies y tecnologías similares",
        paragraphs: [
          "Si nuestra página web o las herramientas utilizadas incorporan cookies u otras tecnologías similares, estas podrán utilizarse para funciones técnicas, preferencias, análisis de uso o publicidad, según corresponda.",
          "Las opciones para administrar o desactivar estas tecnologías dependerán de la plataforma y del navegador utilizados.",
          "Cuando la legislación lo requiera, solicitaremos el consentimiento correspondiente antes de utilizar tecnologías no esenciales.",
        ],
      },
      "8. Participants' rights and requests": {
        heading: "8. Derechos y solicitudes de los participantes",
        paragraphs: [
          "Según las leyes aplicables y las circunstancias de cada solicitud, las personas podrán solicitar: acceso a determinados datos personales que conservamos; corrección de información inexacta; eliminación de datos cuando proceda legalmente; retiro del consentimiento para usos basados en dicho consentimiento; exclusión de comunicaciones promocionales; e información sobre cómo se utiliza o comparte su información.",
          "Para proteger la privacidad, podremos solicitar información razonable para verificar la identidad de la persona que realiza una solicitud.",
          "Algunos registros podrían conservarse cuando exista una obligación legal u otra razón legítima que lo permita.",
        ],
      },
      "9. Privacy of minors": {
        heading: "9. Privacidad de menores de edad",
        paragraphs: [
          "NEONS RUNNING reconoce la importancia de proteger la información de los menores.",
          "Cuando una inscripción requiera autorización de un padre, madre o tutor legal, se solicitará la información necesaria para gestionar dicha autorización y la participación.",
          "No pretendemos recopilar deliberadamente información personal de menores de una manera incompatible con las leyes aplicables. Las fotografías, videos y demás datos identificables de menores recibirán especial consideración y se manejarán con las autorizaciones que correspondan.",
        ],
      },
      "10. Links and external platforms": {
        heading: "10. Enlaces y plataformas externas",
        paragraphs: [
          "Nuestra página podrá incluir enlaces a Facebook, Instagram, plataformas de inscripción, servicios de pago u otros sitios externos.",
          "NEONS RUNNING no controla necesariamente las prácticas de privacidad de estas plataformas. Recomendamos revisar sus respectivas políticas antes de proporcionar información personal.",
          "La información compartida directamente con una plataforma externa estará sujeta también a las condiciones y prácticas de dicha plataforma.",
        ],
      },
      "11. Changes to this policy": {
        heading: "11. Cambios a esta política",
        paragraphs: [
          "NEONS RUNNING podrá actualizar esta Política de Privacidad para reflejar cambios en nuestros servicios, prácticas de manejo de datos o requisitos legales.",
          "La versión vigente se publicará en nuestros canales oficiales e incluirá la fecha de su última actualización.",
          "Cuando un cambio requiera notificación o consentimiento adicional, se tomarán las medidas correspondientes conforme a la legislación aplicable.",
        ],
      },
      "12. Governing law": {
        heading: "12. Legislación aplicable",
        paragraphs: [
          "Esta política se interpretará conforme a las leyes aplicables de Puerto Rico y, cuando corresponda, las leyes federales de Estados Unidos relativas a privacidad y protección de datos.",
          "Nada en esta política pretende limitar derechos que las personas tengan conforme a la legislación aplicable.",
        ],
      },
      "13. Privacy contact and requests": {
        heading: "13. Contacto y solicitudes de privacidad",
        paragraphs: [
          "Si desea realizar una consulta sobre esta política, solicitar acceso a sus datos o pedir la corrección o eliminación de información, podrá comunicarse con NEONS RUNNING a través de los siguientes medios:",
          "Correo electrónico oficial: neonsmultiservicesllc@gmail.com · Página oficial: neonsrunning.com · Asunto recomendado: Solicitud de privacidad de datos personales.",
          "Atenderemos las solicitudes dentro de un plazo razonable, sujeto a la verificación necesaria y a los requisitos legales aplicables.",
          "NEONS RUNNING — Corre con pasión. Supera tus límites. Deja tu huella. Tu confianza es importante para nosotros. Nos comprometemos a tratar tu información de forma responsable y transparente.",
        ],
      },
    },
  },
  refunds: {
    title: "Política de reembolso, cancelación y entrega",
    summary:
      "En NEONS RUNNING, trabajamos para ofrecer experiencias deportivas memorables, promover el running y reconocer el esfuerzo de cada participante. Para garantizar claridad y transparencia, establecemos la siguiente política de reembolso, cancelación y entrega aplicable a nuestras carreras presenciales, carreras virtuales, retos deportivos, medallas, certificados y otros productos o servicios.",
    updated: "22 de octubre de 2026",
    sections: {
      "1. Registrations and payments": {
        heading: "1. Inscripciones y pagos",
        paragraphs: [
          "Una vez completado el proceso de inscripción y confirmado el pago, NEONS RUNNING comenzará a coordinar los servicios, materiales y artículos correspondientes al evento.",
          "Por esta razón, antes de realizar el pago, cada participante deberá verificar la información del evento, el costo de inscripción, la distancia, las fechas y los artículos incluidos.",
        ],
      },
      "2. No-refund policy": {
        heading: "2. Política de no reembolso",
        paragraphs: [
          "Como norma general, las inscripciones no serán reembolsables cuando el participante: decida no participar en el evento por razones personales; no complete la distancia o el reto deportivo; no envíe sus resultados o evidencia dentro del período establecido; se inscriba por error o cambie de opinión después de completar la compra; o no reclame su medalla o certificado dentro del período de entrega anunciado.",
          "Esta disposición estará sujeta a las excepciones establecidas en esta política y a los derechos que correspondan al consumidor conforme a las leyes aplicables.",
        ],
      },
      "3. Cancellation by NEONS RUNNING": {
        heading: "3. Cancelación por parte de NEONS RUNNING",
        paragraphs: [
          "Si NEONS RUNNING cancela un evento y no ofrece una alternativa razonable, se evaluará el reembolso correspondiente de acuerdo con las condiciones anunciadas para ese evento y la legislación aplicable.",
          "Si el evento se pospone o cambia de fecha, se informarán las alternativas disponibles a los participantes.",
          "Cuando corresponda legalmente un reembolso, este se procesará mediante el método de pago original, salvo que se acuerde otro método permitido.",
        ],
      },
      "4. Medals, certificates and personalized items": {
        heading: "4. Medallas, certificados y artículos personalizados",
        paragraphs: [
          "Las medallas, certificados y demás artículos incluidos en una inscripción podrán requerir preparación, fabricación o personalización.",
          "Una vez iniciado ese proceso, la cancelación por decisión del participante no garantiza un reembolso. Sin embargo, esta condición no elimina los derechos que puedan corresponder por defectos, incumplimiento de entrega u otras situaciones protegidas por ley.",
          "Si un artículo llega dañado, presenta un defecto o no corresponde a lo anunciado, el participante deberá comunicarse con NEONS RUNNING para evaluar una solución apropiada.",
        ],
      },
      "5. Delivery and shipping": {
        heading: "5. Entrega y envío",
        paragraphs: [
          "Los participantes son responsables de proporcionar correctamente su nombre, dirección postal y demás datos necesarios para la entrega.",
          "Si un paquete no puede entregarse debido a información incorrecta proporcionada por el participante, se coordinará una posible nueva entrega y se informarán los costos adicionales aplicables antes de procesarla.",
          "Si el retraso o la pérdida del envío se debe a circunstancias atribuibles al transportista o a la organización, se evaluará el caso y se ofrecerá una solución conforme a las condiciones aplicables y a la ley.",
        ],
      },
      "6. Refund requests": {
        heading: "6. Solicitudes de reembolso",
        paragraphs: [
          "Toda solicitud deberá enviarse a través de los canales oficiales de NEONS RUNNING e incluir: nombre completo del participante; nombre del evento o producto adquirido; fecha de inscripción o compra; número de confirmación o evidencia de pago; explicación de la solicitud; y fotografías u otra evidencia, cuando corresponda.",
          "NEONS RUNNING revisará la solicitud y comunicará una respuesta dentro de un plazo razonable.",
          "Cuando se apruebe un reembolso, el tiempo para que los fondos aparezcan en la cuenta dependerá del método de pago y de la entidad financiera correspondiente.",
        ],
      },
      "7. Duplicate payments and billing errors": {
        heading: "7. Pagos duplicados o errores de cobro",
        paragraphs: [
          "Si un participante identifica un pago duplicado o un error de cobro, deberá notificarlo para que pueda investigarse.",
          "Cuando se confirme un cobro duplicado o indebido, se gestionará la corrección o devolución correspondiente conforme a las leyes aplicables.",
        ],
      },
      "8. Exceptions and consumer rights": {
        heading: "8. Excepciones y derechos del consumidor",
        paragraphs: [
          "Esta política no pretende eliminar ni restringir derechos que correspondan a los consumidores bajo las leyes aplicables de Puerto Rico o federales de Estados Unidos.",
          "Cualquier condición particular anunciada para un evento deberá interpretarse junto con esta política. Si existe un conflicto, prevalecerán los derechos y obligaciones exigidos por la legislación aplicable.",
        ],
      },
      "9. Acceptance": {
        heading: "9. Aceptación",
        paragraphs: [
          "Al completar una inscripción o compra, el participante reconoce que ha tenido la oportunidad de revisar esta política antes de pagar.",
          "NEONS RUNNING se compromete a evaluar las solicitudes de forma justa, transparente y consistente.",
          "Contacto para solicitudes: neonsmultiservicesllc@gmail.com · Página oficial: neonsrunning.com",
          "NEONS RUNNING — Corre con pasión. Supera tus límites. Deja tu huella.",
        ],
      },
    },
  },

  cancellation: {
    title: "Política de cancelación, suspensión y reprogramación de eventos",
    summary:
      "En NEONS RUNNING, nuestro compromiso es promover el running, la actividad física y experiencias deportivas que motiven a cada participante a superar sus límites. Para mantener una comunicación clara y transparente, establecemos la siguiente política para nuestros eventos presenciales, carreras virtuales, retos deportivos y actividades especiales.",
    updated: "22 de octubre de 2026",
    sections: {
      "1. Cancellation by NEONS RUNNING": {
        heading: "1. Cancelación por parte de NEONS RUNNING",
        paragraphs: [
          "NEONS RUNNING se reserva el derecho de cancelar un evento cuando existan circunstancias que impidan su realización de manera segura, adecuada o conforme a los requisitos aplicables.",
          "Entre las posibles causas se encuentran: condiciones climatológicas peligrosas; situaciones de emergencia o riesgos para la seguridad; problemas logísticos o dificultades con proveedores; falta de permisos o autorizaciones necesarias; y circunstancias imprevistas fuera del control razonable de la organización.",
          "Cuando se cancele un evento, NEONS RUNNING notificará a los participantes mediante los canales oficiales disponibles e informará las alternativas correspondientes.",
        ],
      },
      "2. Rescheduling of events": {
        heading: "2. Reprogramación de eventos",
        paragraphs: [
          "Cuando las circunstancias lo permitan, NEONS RUNNING podrá reprogramar el evento para una nueva fecha.",
          "La organización comunicará la nueva fecha, los cambios importantes y las instrucciones necesarias para los participantes inscritos.",
          "Si un participante no puede participar en la nueva fecha, su solicitud se evaluará conforme a las condiciones específicas del evento, la política de reembolso y las leyes aplicables.",
        ],
      },
      "3. Suspension due to weather or emergencies": {
        heading: "3. Suspensión por condiciones climáticas o emergencias",
        paragraphs: [
          "La seguridad de los participantes es una prioridad.",
          "Si las condiciones del clima, una emergencia o cualquier situación de riesgo impiden realizar una actividad de forma segura, NEONS RUNNING podrá suspenderla, retrasar su comienzo, modificar la ruta o cambiar la fecha.",
          "Estas decisiones se comunicarán tan pronto como sea razonablemente posible.",
        ],
      },
      "4. Cancellation of virtual races": {
        heading: "4. Cancelación de carreras virtuales",
        paragraphs: [
          "En los eventos virtuales, las fechas de inicio y finalización, la distancia, los requisitos de participación y los plazos para presentar resultados se establecerán en la promoción oficial.",
          "NEONS RUNNING podrá modificar estos períodos o cancelar el reto cuando existan razones justificadas, notificando los cambios a los participantes.",
          "Si el evento virtual se cancela después de haberse realizado una inscripción, se informarán las opciones disponibles, incluyendo reprogramación o reembolso cuando corresponda conforme a las condiciones anunciadas y la legislación aplicable.",
        ],
      },
      "5. Refunds for cancellation": {
        heading: "5. Reembolsos por cancelación",
        paragraphs: [
          "Si NEONS RUNNING cancela definitivamente un evento, sin ofrecer una alternativa razonable, se determinará el tratamiento de los pagos recibidos conforme a las condiciones específicas anunciadas y las leyes aplicables.",
          "Cuando corresponda un reembolso, este se gestionará mediante el método de pago original, salvo que se acuerde otro método permitido.",
          "Si el evento se reprograma, cualquier alternativa de reembolso o crédito se comunicará claramente a los participantes.",
          "Esta política no limita los derechos legales de los consumidores.",
        ],
      },
      "6. Medals, certificates and merchandise": {
        heading: "6. Medallas, certificados y artículos",
        paragraphs: [
          "Si una inscripción incluye medallas, certificados u otros artículos, NEONS RUNNING informará cómo se manejarán estos productos si el evento se cancela o se reprograma.",
          "Cuando los artículos ya hayan sido fabricados, personalizados o enviados, la organización evaluará las alternativas aplicables según las circunstancias, las condiciones de compra y las obligaciones legales correspondientes.",
          "La cancelación de una actividad no elimina los derechos del consumidor relacionados con productos no entregados, defectuosos o servicios incumplidos.",
        ],
      },
      "7. Cancellation by the participant": {
        heading: "7. Cancelación por parte del participante",
        paragraphs: [
          "Si un participante decide retirarse de un evento por motivos personales, deberá notificarlo a NEONS RUNNING mediante los canales oficiales.",
          "La solicitud no garantiza automáticamente un reembolso, una transferencia de inscripción o la entrega de artículos no incluidos en las condiciones originales.",
          "Las solicitudes se evaluarán de acuerdo con la política de reembolso vigente para el evento y la legislación aplicable.",
        ],
      },
      "8. Official communication": {
        heading: "8. Comunicación oficial",
        paragraphs: [
          "Toda notificación relacionada con cancelaciones, suspensiones o cambios de fecha se publicará mediante los canales oficiales de NEONS RUNNING.",
          "Los participantes deberán revisar los anuncios y mantener actualizados sus datos de contacto.",
          "La organización procurará ofrecer información clara y oportuna sobre cualquier modificación importante.",
        ],
      },
      "9. Acceptance of the policy": {
        heading: "9. Aceptación de la política",
        paragraphs: [
          "Al inscribirse en un evento de NEONS RUNNING, el participante reconoce que los eventos deportivos pueden estar sujetos a cambios por razones de seguridad, logística o circunstancias imprevistas.",
          "La aplicación de esta política estará sujeta a las leyes de Puerto Rico y a cualquier otra legislación aplicable. Ninguna disposición pretende excluir responsabilidades o derechos que legalmente no puedan excluirse.",
          "NEONS RUNNING — Corre con pasión. Supera tus límites. Deja tu huella.",
          "Contacto oficial: neonsmultiservicesllc@gmail.com · Página oficial: neonsrunning.com",
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
