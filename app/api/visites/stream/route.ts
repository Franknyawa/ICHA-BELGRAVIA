import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { visiteEvents, NOUVELLE_VISITE } from "@/lib/events";

export const dynamic = "force-dynamic";
// Vercel coupe une fonction serverless à la durée max autorisée par le plan
// (10s par défaut sur Hobby) ; on demande explicitement le maximum possible
// pour que la connexion SSE tienne plus longtemps avant reconnexion.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new Response("Non autorisé.", { status: 403 });
  }

  const encoder = new TextEncoder();

  let onNouvelleVisite: (data: unknown) => void;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ping\ndata: connecte\n\n`));

      let ferme = false;
      const fermer = () => {
        if (ferme) return;
        ferme = true;
        clearInterval(keepAlive);
        clearTimeout(fermetureProgrammee);
        visiteEvents.off(NOUVELLE_VISITE, onNouvelleVisite);
        try {
          controller.close();
        } catch {
          /* déjà fermé côté client */
        }
      };

      onNouvelleVisite = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: nouvelle-visite\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          fermer();
        }
      };
      visiteEvents.on(NOUVELLE_VISITE, onNouvelleVisite);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: keepalive\n\n`));
        } catch {
          fermer();
        }
      }, 25000);

      // Ferme la connexion nous-mêmes avant la limite d'exécution Vercel
      // (maxDuration ci-dessus), pour que ce soit une fin normale plutôt
      // qu'un arrêt forcé — le navigateur reconnecte automatiquement
      // (comportement natif d'EventSource), sans que ça remonte comme une
      // erreur dans les logs Vercel.
      const fermetureProgrammee = setTimeout(fermer, 50000);

      req.signal.addEventListener("abort", fermer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
