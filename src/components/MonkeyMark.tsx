interface MonkeyMarkProps { size?: number; className?: string }

export function MonkeyMark({ size = 40, className }: MonkeyMarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" className={className} aria-hidden="true">
      <rect width="56" height="56" rx="18" fill="#E6EFE4" />
      <g stroke="#2D5945" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.8 22.5c-2.7-2.6-8.2-.6-8.2 4.9 0 5.2 4.8 7.2 8.4 5.3M41 22.5c2.7-2.6 8.2-.6 8.2 4.9 0 5.2-4.8 7.2-8.4 5.3" />
        <path d="M14.2 26c0-11 5.5-17 13.8-17s13.8 6 13.8 17v7c0 9-6 14-13.8 14S14.2 42 14.2 33z" fill="#C0D7BF" />
        <path d="M19.7 31.5c-2.1-6.6 1.7-12.5 8.3-8.5 6.6-4 10.4 1.9 8.3 8.5 2.5 3.5.5 10.8-8.3 10.8s-10.8-7.3-8.3-10.8Z" fill="#F8F5EB" strokeWidth="1.8" />
        <path d="M23.7 31.8v1.6M32.3 31.8v1.6M25 39.2c1.9 1.4 4.1 1.4 6 0" strokeWidth="2.5" />
        <path d="M23 19.3c1.8-1 3.4-2.2 4.8-4" />
      </g>
    </svg>
  );
}
