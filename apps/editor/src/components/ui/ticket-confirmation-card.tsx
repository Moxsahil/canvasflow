import * as React from 'react';
import { cn } from '@/lib/utils';

// A confirmation ticket: a tick, a heading, the order's details between two
// perforations, and a barcode drawn from the order's id. Confetti falls once
// when it first appears. Every word on it comes in through props.

// --- Icons ---

const CheckCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

// --- Helpers ---

const DashedLine = () => (
  <div className="w-full border-t-2 border-dashed border-border" aria-hidden="true" />
);

const Barcode = ({ value, label }: { value: string; label: string }) => {
  const bars = React.useMemo(() => {
    const seed = value.split('').reduce((a, b) => {
      const next = (a << 5) - a + b.charCodeAt(0);
      return next & next;
    }, 0);
    const random = (s: number) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };
    return Array.from({ length: 60 }, (_, index) => ({
      width: random(seed + index) > 0.7 ? 2.5 : 1.5,
    }));
  }, [value]);

  const spacing = 1.5;
  const totalWidth = bars.reduce((acc, bar) => acc + bar.width + spacing, 0) - spacing;
  const svgWidth = 250;
  const svgHeight = 70;
  let currentX = (svgWidth - totalWidth) / 2;

  return (
    <div className="flex flex-col items-center py-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        role="img"
        aria-label={label}
        className="max-w-full fill-current text-foreground"
      >
        {bars.map((bar, index) => {
          const x = currentX;
          currentX += bar.width + spacing;
          return <rect key={index} x={x} y="10" width={bar.width} height="50" />;
        })}
      </svg>
      <p className="mt-2 text-sm tracking-[0.3em] text-muted-foreground">{value}</p>
    </div>
  );
};

const CONFETTI_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#8b5cf6', '#f97316'];

const ConfettiExplosion = () => {
  // Placed once, so a re-render does not throw the pieces somewhere new.
  const pieces = React.useMemo(
    () =>
      Array.from({ length: 100 }, (_, i) => ({
        left: `${Math.random() * 100}%`,
        top: `${-20 + Math.random() * 10}%`,
        backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        transform: `rotate(${Math.random() * 360}deg)`,
        animation: `cf-ticket-fall ${2.5 + Math.random() * 2.5}s ${Math.random() * 2}s linear forwards`,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      {pieces.map((style, i) => (
        <div key={i} className="absolute h-4 w-2" style={style} />
      ))}
    </div>
  );
};

/** The ticket's own animations, which the app's Tailwind does not ship. */
const KEYFRAMES = `
@keyframes cf-ticket-fall {
  0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}
@keyframes cf-ticket-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes cf-ticket-pop {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}
.cf-ticket-in { animation: cf-ticket-in 500ms ease-out both; }
.cf-ticket-pop { animation: cf-ticket-pop 500ms 300ms ease-out both; }
.cf-ticket-pop-late { animation: cf-ticket-pop 500ms 500ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .cf-ticket-in, .cf-ticket-pop, .cf-ticket-pop-late { animation: none; }
}
`;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// --- Main ticket ---

export interface TicketDetail {
  label: string;
  value: React.ReactNode;
  /** Set in the mono face, for ids and amounts. */
  mono?: boolean;
}

export interface TicketProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Shown two to a row between the perforations. */
  details: TicketDetail[];
  barcodeValue: string;
  /** What a screen reader hears for the barcode. */
  barcodeLabel: string;
}

const AnimatedTicket = React.forwardRef<HTMLDivElement, TicketProps>(
  ({ className, title, subtitle, details, barcodeValue, barcodeLabel, ...props }, ref) => {
    const [showConfetti, setShowConfetti] = React.useState(false);

    React.useEffect(() => {
      if (prefersReducedMotion()) return;
      const mountTimer = setTimeout(() => setShowConfetti(true), 100);
      const unmountTimer = setTimeout(() => setShowConfetti(false), 6000);
      return () => {
        clearTimeout(mountTimer);
        clearTimeout(unmountTimer);
      };
    }, []);

    return (
      <>
        <style>{KEYFRAMES}</style>
        {showConfetti && <ConfettiExplosion />}
        <div
          ref={ref}
          className={cn(
            'cf-ticket-in relative z-10 w-full max-w-sm rounded-2xl bg-card font-sans text-card-foreground shadow-lg',
            className,
          )}
          {...props}
        >
          {/* The notches either side of the perforation. */}
          <div className="absolute top-1/2 -left-4 h-8 w-8 -translate-y-1/2 rounded-full bg-background" />
          <div className="absolute top-1/2 -right-4 h-8 w-8 -translate-y-1/2 rounded-full bg-background" />

          <div className="flex flex-col items-center p-8 text-center">
            <div className="cf-ticket-pop rounded-full bg-primary/10 p-3">
              <CheckCircleIcon className="cf-ticket-pop-late h-10 w-10 text-primary" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
          </div>

          <div className="space-y-6 px-8 pb-8">
            <DashedLine />

            <dl className="grid grid-cols-2 gap-4 text-left">
              {details.map((detail, index) => (
                <div key={detail.label} className={index % 2 === 1 ? 'text-right' : undefined}>
                  <dt className="text-xs text-muted-foreground uppercase">{detail.label}</dt>
                  <dd className={cn('m-0 font-medium', detail.mono && 'font-mono')}>
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>

            <DashedLine />

            <Barcode value={barcodeValue} label={barcodeLabel} />
          </div>
        </div>
      </>
    );
  },
);

AnimatedTicket.displayName = 'AnimatedTicket';

export { AnimatedTicket };
