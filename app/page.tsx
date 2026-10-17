import { redirect } from "next/navigation";
import { accueilPourRole } from "@/lib/permissions";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(accueilPourRole(session.role));
}
