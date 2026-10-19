import { cn } from '@/lib/utils';

/** Deterministic QR-looking pattern derived from the code. The implementation swaps in a real encoder. */
export function QrPlaceholder({
  code,
  className,
  size = 160,
}: {
  code: string;
  className?: string;
  size?: number;
}) {
  const n = 21;
  let seed = 0;
  for (const ch of code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const cells: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    cells.push(((seed >> 16) & 1) === 1);
  }
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const finderOn = (x: number, y: number) => {
    const lx = x < 7 ? x : x - (n - 7);
    const ly = y < 7 ? y : y - (n - 7);
    const ring = lx === 0 || ly === 0 || lx === 6 || ly === 6;
    const core = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
    return ring || core;
  };
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      role="img"
      aria-label={`QR code for booking ${code}`}
      className={cn('rounded-md bg-white p-2 shadow-xs', className)}
      shapeRendering="crispEdges"
    >
      <title>{`Booking ${code}`}</title>
      {cells.map((on, i) => {
        const x = i % n;
        const y = Math.floor(i / n);
        const fill = finder(x, y) ? finderOn(x, y) : on;
        return fill ? (
          <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#111" />
        ) : null;
      })}
    </svg>
  );
}
