import { useMemo } from 'react';
import { encode } from 'uqr';
import { cn } from '@/lib/utils';

/** The booking code as a QR code for the gate scanner; never the link token (ADR-0008). */
export function Qr({
  value,
  label,
  size = 112,
  className,
}: {
  value: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const { path, modules } = useMemo(() => {
    const { data } = encode(value, { border: 2 });
    let d = '';
    data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { path: d, modules: data.length };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${modules} ${modules}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('shrink-0 rounded-md bg-white', className)}
    >
      {/* design-check-ignore: QR modules stay black on white for scanners */}
      <path d={path} fill="#000" />
    </svg>
  );
}
