/**
 * What each tool makes, drawn small for the new chat's tiles. Sample pictures
 * rather than words to read, so they stay out of the accessibility tree and out
 * of translation.
 */
const BLUE = '#6f9bff';
const VIOLET = '#a48ff0';
const GREEN = '#57c29a';
const AMBER = '#e0a94f';
const RED = '#f0746e';
const INK = 'var(--surface-fg)';
const QUIET = 'var(--surface-fg-muted)';
const TOPIC = 'Launch plan';

function Step({
  x,
  y,
  w = 118,
  h = 40,
  color,
  label,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  color: string;
  label: string;
}) {
  return (
    <g>
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={10}
        fill={color}
        fillOpacity={0.1}
        stroke={color}
        strokeOpacity={0.55}
      />
      <text x={x} y={y + 4} textAnchor="middle" fill={INK} fontSize={11} fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

function Choice({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <path
        d={`M${x} ${y - 30}L${x + 56} ${y}L${x} ${y + 30}L${x - 56} ${y}Z`}
        fill={AMBER}
        fillOpacity={0.1}
        stroke={AMBER}
        strokeOpacity={0.6}
        strokeLinejoin="round"
      />
      <text x={x} y={y + 4} textAnchor="middle" fill={INK} fontSize={10.5} fontWeight={600}>
        {label}
      </text>
    </g>
  );
}

function Line({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={QUIET} strokeOpacity={0.7} strokeWidth={1.3} />;
}

function Lane({ y, label }: { y: number; label: string }) {
  return (
    <g>
      <rect
        x={0.5}
        y={y + 0.5}
        width={639}
        height={109}
        rx={12}
        fill="var(--surface-fg)"
        fillOpacity={0.025}
        stroke="var(--surface-fg)"
        strokeOpacity={0.07}
      />
      <text x={14} y={y + 20} fill={QUIET} fontSize={10.5} fontWeight={500}>
        {label}
      </text>
    </g>
  );
}

export function TextPreview() {
  return (
    <svg aria-hidden="true" viewBox="0 0 640 330" className="m-auto block max-h-full w-full">
      <Lane y={0} label="Visitor" />
      <Lane y={110} label="App" />
      <Lane y={220} label="Auth service" />
      <Line d="M150 55H190M250 75V145M309 165H340M396 195V245M452 275H500M556 245V195M396 135V90M615 165H622V80" />
      <Step x={95} y={55} w={110} color={GREEN} label="Sign-in" />
      <Step x={250} y={55} color={BLUE} label="Enter details" />
      <Step x={396} y={65} color={RED} label="Show error" />
      <Step x={570} y={55} w={100} color={GREEN} label="Open board" />
      <Step x={250} y={165} color={VIOLET} label="Validate fields" />
      <Choice x={396} y={165} label="Valid?" />
      <Step x={556} y={165} color={VIOLET} label="Create session" />
      <Step x={396} y={275} color={VIOLET} label="Check password" />
      <Choice x={556} y={275} label="Match?" />
    </svg>
  );
}

export function MindMapPreview() {
  const topics: [number, number, string][] = [
    [46, 26, 'Goals'],
    [38, 66, 'Team'],
    [50, 106, 'Risks'],
    [194, 26, 'Budget'],
    [202, 66, 'Launch'],
    [190, 106, 'Dates'],
  ];
  return (
    <svg aria-hidden="true" viewBox="0 0 240 132" className="m-auto block max-h-full w-full">
      {topics.map(([x, y]) => (
        <path
          key={`${x}${y}`}
          d={`M120 66Q${(120 + x) / 2} ${y} ${x} ${y}`}
          fill="none"
          stroke={VIOLET}
          strokeOpacity={0.6}
        />
      ))}
      <rect x={86} y={53} width={68} height={26} rx={13} fill={VIOLET} />
      <text x={120} y={70} textAnchor="middle" fill="#160e2e" fontSize={9.5} fontWeight={700}>
        {TOPIC}
      </text>
      {topics.map(([x, y, label]) => (
        <g key={label}>
          <rect
            x={x - 26}
            y={y - 10}
            width={52}
            height={20}
            rx={10}
            fill={VIOLET}
            fillOpacity={0.12}
            stroke={VIOLET}
            strokeOpacity={0.45}
          />
          <text x={x} y={y + 3} textAnchor="middle" fill={INK} fontSize={9} fontWeight={500}>
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function FlowchartPreview() {
  return (
    <svg aria-hidden="true" viewBox="0 0 240 132" className="m-auto block max-h-full w-full">
      <Line d="M64 66H92M148 66H176M120 40V18H204V48" />
      <Step x={36} y={66} w={56} h={30} color={GREEN} label="Cart" />
      <g transform="translate(120 66) scale(.8)">
        <Choice x={0} y={0} label="Paid?" />
      </g>
      <Step x={204} y={66} w={56} h={30} color={BLUE} label="Ship" />
    </svg>
  );
}

function Table({ x, y, name, rows }: { x: number; y: number; name: string; rows: string[] }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={92}
        height={24 + rows.length * 16}
        rx={7}
        fill={AMBER}
        fillOpacity={0.07}
        stroke={AMBER}
        strokeOpacity={0.45}
      />
      <path d={`M${x} ${y + 22}H${x + 92}`} stroke={AMBER} strokeOpacity={0.3} />
      <text x={x + 9} y={y + 15} fill={AMBER} fontSize={10} fontWeight={600}>
        {name}
      </text>
      {rows.map((row, index) => (
        <text key={row} x={x + 9} y={y + 37 + index * 16} fill={QUIET} fontSize={9}>
          {row}
        </text>
      ))}
    </g>
  );
}

export function EntityPreview() {
  return (
    <svg aria-hidden="true" viewBox="0 0 240 92" className="m-auto block max-h-full w-full">
      <Line d="M102 40H138" />
      <Table x={10} y={8} name="users" rows={['id', 'email', 'name']} />
      <Table x={138} y={14} name="boards" rows={['id', 'owner_id']} />
    </svg>
  );
}

export function CodeSample({ lines }: { lines: readonly (readonly [string, string?])[] }) {
  return (
    <span
      aria-hidden="true"
      className="mt-auto block overflow-hidden rounded-[10px] border border-[var(--surface-line)] bg-[var(--surface-input)] px-2 py-1.5 font-mono text-[10px] leading-[1.5] whitespace-pre text-[var(--surface-fg-muted)]"
    >
      {lines.map(([text, color], index) => (
        <span key={index} className="block" style={color ? { color } : undefined}>
          {text}
        </span>
      ))}
    </span>
  );
}
