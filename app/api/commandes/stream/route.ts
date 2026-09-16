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

      onNouvelleCommande = (data: unknown) => {
        controller.enqueue(encoder.encode(`event: nouvelle-commande\ndata: ${JSON.stringify(data)}\n\n`));
      };
      visiteEvents.on(NOUVELLE_COMMANDE, onNouvelleCommande);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: keepalive\n\n`));
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        visiteEvents.off(NOUVELLE_COMMANDE, onNouvelleCommande);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
