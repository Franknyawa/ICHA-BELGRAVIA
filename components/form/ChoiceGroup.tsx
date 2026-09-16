type Option = { value: string; label: string };

export function ChoiceGroup({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={["choice-pill", value === opt.value ? "choice-pill-active" : ""].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MultiChoiceGroup({
  options,
  values,
  onToggle,
}: {
  options: Option[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const actif = values.includes(opt.value);
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            className={["choice-pill", actif ? "choice-pill-active" : ""].join(" ")}
          >
            {actif ? "✓ " : ""}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
