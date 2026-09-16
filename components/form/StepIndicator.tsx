import { IconUser, IconStorefront, IconGlass, IconCheckCircle } from "@/components/icons";

const STEPS = [
  { label: "Agent", Icon: IconUser },
  { label: "Point de vente", Icon: IconStorefront },
  { label: "Offre & potentiel", Icon: IconGlass },
  { label: "Qualification", Icon: IconCheckCircle },
];

export default function StepIndicator({ step }: { step: number }) {
  return (
    <div className="mb-6 flex items-center gap-1.5 sm:gap-2">
      {STEPS.map(({ label, Icon }, i) => {
        const index = i + 1;
        const actif = index === step;
        const fait = index < step;
        return (
          <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={[
                "flex h-8 w-8 items-center justify-center rounded-full border transition-all",
                actif
                  ? "border-brass bg-brass text-bg shadow-[0_0_0_4px_rgb(var(--color-brass)/0.15)]"
                  : fait
                  ? "border-brass/60 bg-brass/10 text-brass"
                  : "border-line bg-bg-elevated text-ink-muted",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div
              className={["h-[3px] w-full rounded-full transition-colors", fait || actif ? "bg-brass" : "bg-line"].join(" ")}
            />
            <span
              className={["hidden text-[11px] sm:block", actif ? "text-brass" : "text-ink-muted"].join(" ")}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
