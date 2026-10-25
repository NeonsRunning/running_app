import type { MetadataRoute } from "next";

/**
 * Lets phones save the site to the home screen with its own name and icon.
 * One manifest serves both languages, so it is written in the default one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEONS RUNNING",
    short_name: "NEONS",
    description:
      "Descubre carreras en Puerto Rico, inscríbete en menos de un minuto y sigue tus resultados.",
    lang: "es-PR",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
