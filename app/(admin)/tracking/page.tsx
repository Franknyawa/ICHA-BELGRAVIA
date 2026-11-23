import { redirect } from "next/navigation";

/** Le tracking est fusionné dans la page Carte (onglet « Suivi des commerciaux »). */
export default function Page() {
  redirect("/statistiques?vue=suivi");
}
