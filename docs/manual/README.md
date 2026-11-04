# Manual de uso — NEONS RUNNING

NEONS RUNNING es la plataforma para descubrir carreras, inscribirse, pagar y
publicar resultados en la comunidad de corredores del Caribe.

Este manual explica **quién puede hacer qué** dentro de la aplicación y **cómo
hacerlo**, paso a paso. Está escrito para dos públicos:

- **Usuarios finales** (corredores, organizadores y administradores): el texto
  principal de cada sección.
- **Equipo técnico**: los recuadros marcados como **🛠 Nota técnica**, con las
  rutas, tablas y funciones que hay detrás de cada flujo. Un usuario final
  puede saltárselos.

## Tipos de usuario

| Rol | Quién es | Cómo se obtiene |
| --- | --- | --- |
| **Visitante** | Cualquier persona que entra sin iniciar sesión | — |
| **Corredor** | Toda persona con una cuenta | Creando una cuenta (correo o Google) |
| **Organizador** | Corredor con las herramientas para publicar y gestionar eventos | Lo activa el equipo de NEONS RUNNING a petición |
| **Administrador** | Miembro del equipo que modera la plataforma | Lo asigna el equipo técnico |

Los roles son acumulativos: un organizador sigue siendo corredor (puede
inscribirse en carreras con la misma cuenta) y un administrador conserva lo
que su cuenta ya tenía.

> **🛠 Nota técnica:** el rol de corredor u organizador vive en
> `profiles.account_type` (`'runner'` | `'organizer'`, comprobado en la base de
> datos con `public.is_organizer()`). El de administrador es independiente: una
> fila en `platform_admins`, comprobada con `public.is_platform_admin()`. Los
> usuarios no pueden cambiar ninguno de los dos desde la aplicación.

## Contenido

1. [Primeros pasos](01-primeros-pasos.md) — crear cuenta, iniciar sesión,
   recuperar la contraseña, idioma y navegación.
2. [Guía del corredor](02-corredor.md) — buscar carreras, inscribirse, pagar,
   perfil, resultados, medallas y ajustes.
3. [Guía del organizador](03-organizador.md) — publicar eventos, confirmar
   pagos, gestionar inscripciones, envíos, check-in y resultados.
4. [Guía del administrador](04-administrador.md) — revisión de pagos, cuentas
   de ATH Móvil, moderación de eventos, usuarios y tareas del equipo técnico.
5. [Guía del visitante](05-visitante.md) — qué se puede hacer sin cuenta:
   explorar carreras, resultados, perfiles públicos, ayuda y contacto.
6. [Correos y notificaciones](06-correos.md) — todos los correos, quién los
   recibe, cuándo y cómo desactivarlos.
7. [Preguntas frecuentes y solución de problemas](07-preguntas-frecuentes.md)
   — qué hacer cuando algo no sale como se espera, por rol.
8. [Anexo: matriz de permisos](08-matriz-permisos.md) — qué puede hacer cada
   rol, tarea por tarea.

## Convenciones

- Los nombres de botones, menús y campos aparecen **en negrita**, tal como se
  ven en la aplicación en español.
- Las rutas (`/events`, `/runners/me`) son la parte de la dirección después del
  dominio. En inglés llevan delante `/en` (por ejemplo `/en/events`).
- Las capturas de pantalla están en [`img/`](img/), en una carpeta por guía.
  Se tomaron con **datos de demostración** (personas y carreras ficticias) en
  un entorno local, así que nombres, montos y fechas son solo ejemplos.

> **🛠 Nota técnica:** las capturas se generaron con Supabase local
> (`supabase start`) y `next dev` con las variables de Stripe y Brevo vacías,
> así que no hubo cobros ni correos. Por eso el paso de pago solo muestra
> ATH Móvil. Ninguna captura sale de producción.
