export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="PokerElo">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#12181f" stroke="#232d38" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#2fd987" strokeWidth="5" />
      <path
        d="M32 20c4.5 6 10 9.5 10 15a6 6 0 0 1-9 5.2c.4 2.4 1.4 4 3 4.8h-8c1.6-.8 2.6-2.4 3-4.8a6 6 0 0 1-9-5.2c0-5.5 5.5-9 10-15z"
        fill="#eceff3"
      />
    </svg>
  );
}
