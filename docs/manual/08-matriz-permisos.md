# 8. Anexo: matriz de permisos

[← Volver al índice](README.md)

Qué puede hacer cada rol. Los roles son acumulativos: un organizador puede
todo lo del corredor, y un administrador conserva lo que su cuenta ya tenía.
En la columna **Organizador**, las tareas de gestión se refieren a **sus
propios eventos**; el administrador las puede hacer en **cualquier** evento.

**Leyenda:** ✅ sí · — no · 🔒 solo lo propio

## Explorar

| Tarea | Visitante | Corredor | Organizador | Admin |
| --- | :---: | :---: | :---: | :---: |
| Ver la portada, buscar y filtrar carreras | ✅ | ✅ | ✅ | ✅ |
| Ver el detalle de una carrera y compartirla | ✅ | ✅ | ✅ | ✅ |
| Ver resultados oficiales | ✅ | ✅ | ✅ | ✅ |
| Ver perfiles públicos | ✅ | ✅ | ✅ | ✅ |
| Leer FAQ y políticas, usar **Contacto** | ✅ | ✅ | ✅ | ✅ |
| Guardar carreras | — | ✅ | ✅ | ✅ |

## Como corredor

| Tarea | Visitante | Corredor | Organizador | Admin |
| --- | :---: | :---: | :---: | :---: |
| Inscribirse y pagar (tarjeta o ATH Móvil) | — | ✅ | ✅ | ✅ |
| Ver su perfil, inscripciones y envíos | — | 🔒 | 🔒 | 🔒 |
| Enviar evidencia de llegada | — | 🔒 | 🔒 | 🔒 |
| Elegir o cambiar la entrega de la medalla | — | 🔒 | 🔒 | 🔒 |
| Editar perfil, datos de carrera y dirección | — | 🔒 | 🔒 | 🔒 |
| Preferencias de correo y privacidad del perfil | — | 🔒 | 🔒 | 🔒 |
| Exportar sus datos / pedir el borrado de la cuenta | — | 🔒 | 🔒 | 🔒 |
| Pedir acceso de organizador | — | ✅ | — | — |

## Eventos

| Tarea | Visitante | Corredor | Organizador | Admin |
| --- | :---: | :---: | :---: | :---: |
| Ver el panel de organizador | — | — | 🔒 | 🔒 ¹ |
| Crear y publicar eventos | — | — | ✅ | 🔒 ¹ |
| Editar un evento | — | — | 🔒 | ✅ |
| Eliminar un evento sin pagos | — | — | 🔒 | 🔒 ¹ |
| Retirar y restaurar eventos (con motivo) | — | — | — | ✅ |

¹ Solo si la cuenta del administrador también es de organizador.

## Gestión de un evento

| Tarea | Visitante | Corredor | Organizador | Admin |
| --- | :---: | :---: | :---: | :---: |
| Ver las inscripciones y exportar CSV | — | — | 🔒 | ✅ |
| Confirmar o rechazar pagos de ATH Móvil | — | — | 🔒 ² | ✅ |
| Volver un pago de ATH Móvil a pendiente | — | — | 🔒 | ✅ |
| Eliminar a un corredor | — | — | 🔒 | ✅ |
| Marcar kits y medallas enviados o recogidos | — | — | 🔒 | ✅ |
| Check-in del día de la carrera | — | — | 🔒 | ✅ |
| Aceptar o rechazar resultados | — | — | 🔒 | ✅ |
| Descalificar un resultado | — | — | 🔒 | ✅ |
| Restablecer un resultado descalificado | — | — | — | ✅ |

² Solo los pagos enviados a una cuenta de ATH Móvil de la que es dueño.

## Plataforma

| Tarea | Visitante | Corredor | Organizador | Admin |
| --- | :---: | :---: | :---: | :---: |
| Cola de pagos de ATH Móvil de todos los eventos | — | — | — | ✅ |
| Gestionar las cuentas de ATH Móvil | — | — | — | ✅ |
| Ver la lista de usuarios y los perfiles privados | — | — | — | ✅ |
| Activar organizadores o administradores | — | — | — | — ³ |
| Atender solicitudes de borrado de cuenta | — | — | — | — ³ |
| Reembolsos | — | — | — ⁴ | — ⁴ |

³ No hay pantalla en la app: lo hace el equipo técnico en la base de datos
(ver [4.7](04-administrador.md#47-tareas-fuera-de-la-app-equipo-técnico)).
⁴ Se hacen fuera de la app, en Stripe o en ATH Móvil Business.

> **🛠 Nota técnica:** cómo se aplica cada columna.
>
> | Rol | Comprobación en la app | Comprobación en la base de datos |
> | --- | --- | --- |
> | Corredor | `requireAccount()` / `requireUser()` | `auth.uid()` en las políticas de seguridad a nivel de fila |
> | Organizador | `requireOrganizer()` | `public.is_organizer()`; las escrituras de eventos pasan por `save_event()` y `delete_event()` |
> | Gestión de un evento | `canManage` en la página del evento | `public.can_manage_event()`: el organizador del evento o un administrador |
> | Pagos de ATH Móvil | `canReview` | `public.can_review_ath_movil_payment()`: administrador, o el organizador dueño de la cuenta |
> | Administrador | `isPlatformAdmin()` / `requireAdmin()` | `public.is_platform_admin()` (tabla `platform_admins`) |
>
> La base de datos es la que decide: las comprobaciones de la app sirven para
> mostrar u ocultar botones y dar mensajes claros, pero cada función SQL
> vuelve a verificar el permiso.

---

[← Preguntas frecuentes](07-preguntas-frecuentes.md) · [Índice](README.md)
