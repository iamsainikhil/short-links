"use client";

export interface ChartDay {
  label: string;
  date: string;
  count: number;
}

export function ClickChart({ days }: { days: ChartDay[] }) {
  const width = 560;
  const height = 160;
  const padTop = 16;
  const padBottom = 22;
  const padLeft = 30;
  const padRight = 8;
  const innerHeight = height - padTop - padBottom;
  const maxCount = Math.max(...days.map((d) => d.count), 1);
  const slotWidth = (width - padLeft - padRight) / days.length;
  const barWidth = Math.min(slotWidth * 0.72, 26);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-40 w-full"
      role="img"
      aria-label="Clicks over time"
      preserveAspectRatio="none"
    >
      <g stroke="hsl(var(--border))" strokeDasharray="3 3">
        {[0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = padTop + innerHeight - innerHeight * fraction;
          return <line key={fraction} x1={padLeft} y1={y} x2={width - padRight} y2={y} />;
        })}
      </g>
      {days.map((day, index) => {
        const x = padLeft + index * slotWidth;
        const barHeight = day.count > 0 ? Math.max((day.count / maxCount) * innerHeight, 3) : 0;
        const barY = padTop + innerHeight - barHeight;
        const cx = x + slotWidth / 2;

        return (
          <g key={day.date}>
            <title>{`${day.date} — ${day.count} click${day.count === 1 ? '' : 's'}`}</title>
            <rect
              x={x + (slotWidth - barWidth) / 2}
              y={barY}
              width={barWidth}
              height={barHeight}
              rx={3}
              className="fill-primary/70"
            />
            {day.count > 0 && (
              <text
                x={cx}
                y={barY - 4}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {day.count}
              </text>
            )}
            <text
              x={cx}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {day.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}