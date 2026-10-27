/** Le logo : une maison sur fond brique (même dessin que public/icone.svg). */
export function Logo({ taille = 28 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--mantine-color-brique-6)" />
      <path d="M14 31 32 16l18 15" fill="none" stroke="#fff8f0" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 28v19h26V28" fill="none" stroke="#fff8f0" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M28 47v-9a4 4 0 0 1 8 0v9" fill="#fff8f0" />
    </svg>
  );
}
