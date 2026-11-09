import { useState } from 'react';
import { Link } from 'react-router-dom';
import { niceStep, num } from '../../lib/format';

export interface BarRow {
  id: string;
  name: string;
  sub: string;
  value: number;
  share: string;
  tooltip: string;
  to: string;
}

/** Horizontal bars with a value axis, hover/focus tooltips and links. */
export function BarList({ rows }: { rows: BarRow[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.map((r) => r.value));
  const step = niceStep(max / 4);
  const axisMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= axisMax + 0.001; v += step) ticks.push(v);

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
        {rows.map((r) => (
          <Link
            key={r.id}
            to={r.to}
            className="bar-row"
            aria-label={`${r.name}: ${num(r.value)} support notes, ${r.share}. Open topic.`}
            onMouseEnter={() => setHover(r.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(r.id)}
            onBlur={() => setHover(null)}
          >
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{r.name}</span>
              <span className="small muted">{r.sub}</span>
            </span>
            <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.value / axisMax) * 100}%` }} /></span>
            <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{num(r.value)}</span>
            <span className="small muted" style={{ textAlign: 'right' }}>{r.share}</span>
            {hover === r.id && <span role="tooltip" className="tooltip" style={{ right: 8, top: -32 }}>{r.tooltip}</span>}
          </Link>
        ))}
      </div>
      <div className="bar-axis" aria-hidden="true">
        <span>Topic</span>
        <span className="ticks">
          {ticks.map((t) => <span key={t} style={{ left: `${(t / axisMax) * 100}%` }}>{num(t)}</span>)}
        </span>
        <span style={{ textAlign: 'right' }}>Notes</span>
        <span style={{ textAlign: 'right' }}>Share</span>
      </div>
    </div>
  );
}
