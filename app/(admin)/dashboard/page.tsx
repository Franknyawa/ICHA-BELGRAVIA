import { redirect } from "next/navigation";

/** L'onglet « Visites terrain » est fusionné dans « Points de vente » (fiche détaillée par point). */
export default function Page() {
  redirect("/points-de-vente");
}
