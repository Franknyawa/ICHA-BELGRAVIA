import { IconUser, IconStorefront, IconGlass, IconCheckCircle } from "@/components/icons";

const STEPS = [
  { label: "Agent", Icon: IconUser },
  { label: "Point de vente", Icon: IconStorefront },
  { label: "Offre & potentiel", Icon: IconGlass },
  { label: "Qualification", Icon: IconCheckCircle },
];

/**
 * Barre de progression du formulaire — chaque rubrique est un bouton : un
 * appui sur son icône y mène directement, sans repasser par "Retour" en bas
 * de page. `peutAller` bloque une rubrique tant que ses prérequis ne sont
 * pas remplis (ex. nom de l'établissement) ; la raison s'affiche au survol.
 */
export default function StepIndicator({
  step,
  onSelect,
  peutAller,
}: {
  step: number;
  onSelect?: (index: number) => void;
  peutAller?: (index: number) => boolean;
}) {
  return (
    <nav aria-label="Rubriques du formulaire" className="flex items-start gap-1.5 sm:gap-2">
      {STEPS.map(({ label, Icon }, i) => {
        const index = i + 1;
        const actif = index === step;
        const fait = index < step;
        const accessible = !peutAller || peutAller(index);
        return (
          <button
            key={label}
            type="button"
            onClick={() => accessible && onSelect?.(index)}
            disabled={!accessible}
            aria-current={actif ? "step" : undefined}
            aria-label={label}
            title={accessible ? label : "Renseignez d'abord le nom de l'établissement"}
            className="group flex flex-1 flex-col items-center gap-1.5 rounded-md py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              className={[
                "flex h-9 w-9 items-center justify-center rounded-full border transition-all group-active:scale-95",
                actif
                  ? "border-brass bg-brass text-bg shadow-[0_0_0_4px_rgb(var(--color-brass)/0.15)]"
                  : fait
                  ? "border-brass/60 bg-brass/10 text-brass group-hover:bg-brass/20"
                  : "border-line bg-bg-elevated text-ink-muted group-enabled:group-hover:border-brass/60 group-enabled:group-hover:text-brass",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span
              className={["h-[3px] w-full rounded-full transition-colors", fait || actif ? "bg-brass" : "bg-line"].join(" ")}
            />
            <span className={["hidden text-[11px] sm:block", actif ? "text-brass" : "text-ink-muted"].join(" ")}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
