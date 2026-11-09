import { useEffect, useRef, useState } from 'react';
import { niceStep, num } from '../../lib/format';

export interface LineSeries {
  name: string;
  values: number[];
  color: string;
  dashed?: boolean;
}

interface Props {
  points: { label: string; tooltip: string }[];
  series: LineSeries[];
  unit: string;
  xUnit: string;
  ariaLabel: string;
  markers?: { position: number; label: string }[];
  tickIndexes?: number[];
  area?: boolean;
  periodHeader?: string;
}

const H = 240, L = 52, R = 16, T = 24, B = 36;
const PH = H - T - B;

/** SVG line chart with axes, units, hover tooltip and an accessible data table. */
export function LineChart({ points, series, unit, xUnit, ariaLabel, markers = [], tickIndexes, area, periodHeader = 'Period' }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the container's real width so text stays 11px at any card width.
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(360, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const PW = W - L - R;
  const n = points.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const X = (i: number) => L + (n === 1 ? PW / 2 : (i * PW) / (n - 1));
  const Y = (v: number) => T + PH - (v / top) * PH;
  const yTicks: number[] = [];
  for (let v = 0; v <= top + 0.001; v += step) yTicks.push(v);

  let idx = tickIndexes;
  if (!idx) {
    idx = [];
    const every = Math.max(1, Math.ceil(n / 6));
    for (let i = 0; i < n; i += every) idx.push(i);
    if (n - 1 - idx[idx.length - 1] >= every / 2) idx.push(n - 1);
  }
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const colW = n > 1 ? PW / (n - 1) : PW;

  return (
    <div>
      <div ref={boxRef} style={{ position: 'relative', marginTop: 8 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={ariaLabel} style={{ display: 'block' }}>
          <text x={L} y={12} fontSize={11} fill="#5B5675">{unit}</text>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="#EFEDF7" />
              <text x={L - 6} y={Y(v) + 4} fontSize={11} fill="#5B5675" textAnchor="end">{num(v)}</text>
            </g>
          ))}
          <line x1={L} x2={W - R} y1={T + PH} y2={T + PH} stroke="#D9D4F0" />
          {idx.map((i) => <text key={i} x={X(i)} y={222} fontSize={11} fill="#5B5675" textAnchor="middle">{points[i].label}</text>)}
          <text x={W - R} y={238} fontSize={11} fill="#5B5675" textAnchor="end">{xUnit}</text>
          {markers.map((m) => (
            <g key={m.label}>
              <line x1={X(m.position)} x2={X(m.position)} y1={T} y2={T + PH} stroke="#8A4A16" strokeDasharray="4 5" />
              <text x={X(m.position) - 128} y={34} fontSize={11} fill="#8A4A16">{m.label}</text>
            </g>
          ))}
          {area && series[0] && (
            <path d={`${path(series[0].values)} L${X(n - 1).toFixed(1)} ${T + PH} L${X(0).toFixed(1)} ${T + PH} Z`} fill="#EEEBFA" />
          )}
          {series.map((s) => (
            <path key={s.name} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 3 : 2.5} strokeDasharray={s.dashed ? '7 5' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover !== null && (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={T} y2={T + PH} stroke="#D9D4F0" />
              {series.map((s, k) => (
                <circle key={s.name} cx={X(hover)} cy={Y(s.values[hover])} r={5} fill={k === 0 ? s.color : '#FFFFFF'} stroke={s.color} strokeWidth={2.5} />
              ))}
            </g>
          )}
          {points.map((_, i) => (
            <rect key={i} x={X(i) - colW / 2} y={T} width={colW} height={PH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        {hover !== null && (
          <div role="tooltip" className="tooltip" style={{ top: 28, left: `${Math.min(84, Math.max(16, (X(hover) / W) * 100))}%`, transform: 'translateX(-50%)', padding: '8px 12px', borderRadius: 12 }}>
            <div style={{ fontWeight: 600 }}>{points[hover].tooltip}</div>
            {series.map((s) => <div key={s.name}>{s.name}: {num(s.values[hover])} notes</div>)}
          </div>
        )}
      </div>
      <details className="data-table" style={{ marginTop: 6 }}>
        <summary>Show data table</summary>
        <div style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th scope="col">{periodHeader}</th>
                {series.map((s) => <th key={s.name} scope="col" className="num">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>{p.tooltip}</td>
                  {series.map((s) => <td key={s.name} className="num">{num(s.values[i])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
