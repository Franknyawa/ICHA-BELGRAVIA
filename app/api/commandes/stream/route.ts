import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { visiteEvents, NOUVELLE_COMMANDE } from "@/lib/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new Response("Non autorisé.", { status: 403 });
  }

  const encoder = new TextEncoder();
  let onNouvelleCommande: (data: unknown) => void;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ping\ndata: connecte\n\n`));

      let ferme = false;
      const fermer = () => {
        if (ferme) return;
        ferme = true;
        clearInterval(keepAlive);
        clearTimeout(fermetureProgrammee);
        visiteEvents.off(NOUVELLE_COMMANDE, onNouvelleCommande);
        try {
          controller.close();
        } catch {
          /* déjà fermé côté client */
        }
      };

      onNouvelleCommande = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: nouvelle-commande\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          fermer();
        }
      };
      visiteEvents.on(NOUVELLE_COMMANDE, onNouvelleCommande);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: keepalive\n\n`));
        } catch {
          fermer();
        }
      }, 25000);

      // Fermeture volontaire avant la limite Vercel — voir explication dans
      // app/api/visites/stream/route.ts.
      const fermetureProgrammee = setTimeout(fermer, 50000);

      req.signal.addEventListener("abort", fermer);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
