import { useId } from "react";

// Monograma "G2" inspirado na identidade visual da Going2 (going2.com.br):
// mesmo gradiente verde -> azul do ícone/wordmark oficial do site.
export function Going2Logo({ className }: { className?: string }) {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Going2">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3AA655" />
          <stop offset="100%" stopColor="#2D6FE0" />
        </linearGradient>
      </defs>
      <text
        x="50%"
        y="54%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontWeight={800}
        fontSize={40}
        letterSpacing="-0.03em"
        fill={`url(#${gradientId})`}
      >
        G2
      </text>
    </svg>
  );
}
