/* eslint-disable @next/next/no-img-element */

/**
 * Logo SIRI IMPORT. La version dorée se lit sur fond sombre ; sur les surfaces
 * claires, `plaque` la pose sur une pastille sombre (qui disparaît en mode sombre).
 */
export default function LogoSiri({
  hauteur = 40,
  plaque = false,
  className = "",
}: {
  hauteur?: number;
  plaque?: boolean;
  className?: string;
}) {
  const img = (
    <img
      src="/siri-or.png"
      alt="SIRI IMPORT"
      style={{ height: hauteur, width: "auto" }}
      className="block select-none"
      draggable={false}
    />
  );
  if (!plaque) return <span className={className}>{img}</span>;
  return <span className={`logo-plaque ${className}`}>{img}</span>;
}
