# 6. Correos y notificaciones

[← Volver al índice](README.md)

NEONS RUNNING avisa **por correo electrónico**. El centro de **Notificaciones**
dentro de la app todavía no muestra avisos (ver
[2.11](02-corredor.md#211-funciones-en-desarrollo)).

Esta sección reúne todos los correos en un solo lugar: quién los recibe,
cuándo y si se pueden desactivar.

## 6.1 Correos de la cuenta

Los envía el sistema de cuentas (Supabase Auth), no el de avisos de carreras.

| Correo | Cuándo llega | Validez |
| --- | --- | --- |
| Confirmación de correo | Al crear una cuenta con correo y contraseña | 24 horas |
| Recuperar contraseña | Al pedirlo en **¿Olvidaste la contraseña?** | 30 minutos |

El correo de la cuenta no se puede cambiar desde la app: en **Ajustes** es de
solo lectura. Para cambiarlo, escribe al equipo.

Cada enlace abre la pantalla **Confirma que eres tú** antes de usarse (ver
[Primeros pasos](01-primeros-pasos.md)).

## 6.2 Correos al corredor

| Asunto | Cuándo llega | Se puede desactivar con |
| --- | --- | --- |
| **¡Estás inscrito! …** | Se confirma el pago: con tarjeta al instante; con ATH Móvil cuando lo aprueban. Incluye el dorsal. | — |
| **Mañana: …** | El día antes de la carrera: dorsal, hora de salida y lugar | **Recordatorios de carrera** |
| **Actualización: … cambió** | Cambió la fecha, la hora de salida o el lugar de una carrera publicada que aún no ha pasado. Dice qué era antes y qué es ahora. Como máximo 3 por evento al día. | **Actualizaciones del evento** |
| **Tu pago por ATH Móvil para … no se confirmó** | Rechazaron tu pago por ATH Móvil. La página de inscripción muestra el aviso durante 7 días y deja pagar otra vez. | — |
| **Tu pago para … está en revisión de nuevo** | El organizador o un administrador devolvió tu pago de ATH Móvil a pendiente. Conservas el cupo, no el dorsal. | — |
| **Tu inscripción en … fue cancelada** | El organizador o un administrador te quitó de la carrera. El reembolso no es automático. | — |
| **Te reembolsamos tu pago para …** | La app cobró tu tarjeta pero no pudo confirmar la inscripción (la carrera se llenó o cerró mientras pagabas, cambió tu pedido, ya habías enviado un pago por ATH Móvil o pagaste dos veces) y te devolvió el pago completo. | — |
| **Tu resultado de … es oficial** | Aceptaron tu resultado; la medalla ya está en tu perfil | **Resultados publicados** |
| **Tu resultado de … necesita revisión** | Devolvieron tu resultado, con la nota del organizador si dejó una | **Resultados publicados** |
| **Tu resultado de … fue descalificado** | Descalificaron tu resultado, con el motivo | **Resultados publicados** |
| **Tu paquete de … va en camino** | El organizador marcó tu paquete como enviado, con el rastreo si lo añadió | — |
| **Tu medalla de finisher de … va en camino** | El organizador marcó tu medalla como enviada | — |
| **… fue cancelado** | Un administrador retiró una carrera que aún no se había corrido | — |
| **Buenas noticias: … va de nuevo** | Un administrador restauró esa carrera | — |

## 6.3 Correos al organizador

| Asunto | Cuándo llega |
| --- | --- |
| **Pago por ATH Móvil por revisar: corredor, evento** | Un corredor envió un pago por ATH Móvil a una cuenta de la que el organizador es dueño |
| **Resultado por revisar: corredor, evento** | Un corredor envió su evidencia de llegada |
| **Actualizamos …** | Un administrador editó su evento; dice qué pasos cambiaron |
| **… fue retirado de NEONS RUNNING** | Un administrador retiró su evento; incluye el motivo |
| **… volvió a NEONS RUNNING** | Un administrador restauró su evento |

El organizador **no** recibe un correo por cada inscripción; las ve en su
[panel](03-organizador.md#31-panel-de-organizador).

## 6.4 Correos al equipo

Llegan a la bandeja del equipo (`CONTACT_EMAIL`), no a ninguna cuenta de la
app.

| Asunto | Cuándo llega |
| --- | --- |
| **Formulario de contacto: tema de nombre** | Alguien envió el formulario de **Contacto**; responder contesta a esa persona |
| **Solicitud de borrado de cuenta: nombre** | Un corredor pidió borrar su cuenta; indica qué conserva la cuenta (inscripciones, pagos) |
| **Solicitud de borrado retirada: nombre** | El corredor retiró la solicitud: no hay que hacer nada |

Los administradores no reciben los avisos de pagos ni de resultados por
revisar: los atienden desde [Revisión de Pagos](04-administrador.md#42-revisión-de-pagos).

## 6.5 Elegir qué correos recibir

Tres tipos de correo se pueden desactivar. El resto son avisos sobre tu
dinero, tu cupo o tus envíos, y siempre llegan.

| Preferencia | Qué controla |
| --- | --- |
| **Recordatorios de carrera** | El correo del día antes |
| **Resultados publicados** | Resultado aceptado, devuelto o descalificado |
| **Actualizaciones del evento** | Cambios de fecha, hora o lugar |

Se cambian de dos formas:

- **Ajustes** → **Notificaciones**: un interruptor por tipo, que se guarda al
  cambiarlo.
- El enlace **Elige qué correos recibes**, al pie de esos correos, abre esos
  mismos interruptores en **Ajustes** (pide iniciar sesión).
- El botón **Cancelar suscripción** que muestran Gmail, Outlook y otras
  aplicaciones de correo en esos correos desactiva ese tipo con un clic, sin
  iniciar sesión.

## 6.6 Idioma de los correos

- Los correos de una inscripción llegan en el **idioma en que te
  inscribiste**.
- Los del organizador llegan en el **último idioma que usó** en la app.

> **🛠 Nota técnica:**
>
> - **Envío:** Brevo (`lib/email/brevo.ts`). Sin `BREVO_API_KEY` y
>   `BREVO_SENDER_EMAIL` no se envía nada; así funciona el entorno local.
> - **Cola:** los correos que no pueden perderse pasan por la cola de envío
>   (`lib/email/outbox.ts`), que reintenta los fallos. La procesa
>   `/api/cron/email-outbox` cada 10 minutos.
> - **Recordatorios:** `/api/cron/race-reminders` corre cada hora. Ambos cron
>   los programa pg_cron (`20261125120000_schedule_cron_routes.sql`) y exigen
>   `Authorization: Bearer $CRON_SECRET`.
> - **Sin duplicados:** los correos que podrían dispararse dos veces
>   (confirmación, recordatorio, kit, medalla) se "reclaman" marcando una
>   columna `*_email_sent_at` antes de enviarse. Si el envío falla, la marca se
>   devuelve para reintentar.
> - **Preferencias:** `profile_private.email_reminders`, `email_results` y
>   `email_updates`. Los correos opcionales llevan la cabecera
>   `List-Unsubscribe` con un token HMAC por usuario y preferencia, hacia
>   `/api/email/unsubscribe`. Un `POST` (baja con un clic, RFC 8058) desactiva
>   la preferencia sin sesión. Un `GET` nunca da de baja: redirige a Ajustes,
>   para que un escáner de enlaces no desactive nada.
> - **Límite:** los avisos de cambio de fecha, hora o lugar están limitados a
>   3 por evento al día (`LIMITS.raceDayEmailsPerEvent`).
> - **Plantillas:** `lib/email/*.ts`. Los textos están en
>   `dictionaries/*.json`, bajo `emails`.
> - **Reembolsos manuales:** un reembolso hecho en el panel de Stripe no envía
>   correo.

---

[← Guía del visitante](05-visitante.md) · [Índice](README.md) · [Preguntas frecuentes →](07-preguntas-frecuentes.md)
