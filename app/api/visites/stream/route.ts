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

      onNouvelleVisite = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: nouvelle-visite\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };
      visiteEvents.on(NOUVELLE_VISITE, onNouvelleVisite);

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: keepalive\n\n`));
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAlive);
        visiteEvents.off(NOUVELLE_VISITE, onNouvelleVisite);
        controller.close();
      });
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
