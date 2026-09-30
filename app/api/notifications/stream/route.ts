import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { visiteEvents, NOUVELLE_NOTIFICATION } from "@/lib/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Flux temps réel des notifications pour le commercial connecté — même
 * mécanisme SSE que app/api/commandes/stream (voir lib/events.ts), filtré
 * pour ne transmettre que les notifications adressées à ce commercial.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "COMMERCIAL") {
    return new Response("Non autorisé.", { status: 403 });
  }
  const commercialId = session.userId;

  const encoder = new TextEncoder();
  let onNotification: (data: { commercialId: string; notification: unknown }) => void;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ping\ndata: connecte\n\n`));

      let ferme = false;
      const fermer = () => {
        if (ferme) return;
        ferme = true;
        clearInterval(keepAlive);
        clearTimeout(fermetureProgrammee);
        visiteEvents.off(NOUVELLE_NOTIFICATION, onNotification);
        try {
          controller.close();
        } catch {
          /* déjà fermé côté client */
        }
      };

      onNotification = (data) => {
        if (data.commercialId !== commercialId) return;
        try {
          controller.enqueue(
            encoder.encode(`event: nouvelle-notification\ndata: ${JSON.stringify(data.notification)}\n\n`)
          );
        } catch {
          fermer();
        }
      };
      visiteEvents.on(NOUVELLE_NOTIFICATION, onNotification);

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`event: ping\ndata: keepalive\n\n`));
        } catch {
          fermer();
        }
      }, 25000);

      const fermetureProgrammee = setTimeout(fermer, 50000);

      req.signal.addEventListener("abort", fermer);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
