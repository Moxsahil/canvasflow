import { CinematicLogoCloud } from '@/components/ui/cinematic-logo-cloud';

/**
 * Teams whose everyday work runs on a shared canvas — planning, diagramming,
 * design review — in place of the AI roster the component ships as sample data.
 *
 * Set as text rather than logos on purpose: the image path fetches marks from
 * cdn.simpleicons.org, which puts a third-party request and someone else's
 * trademarks on the page. Wordmarks keep both out of it.
 */
const clients = [
  { name: 'Spotify', text: true, className: 'text-xl font-bold' },
  { name: 'Airbnb', text: true, className: 'text-lg font-semibold' },
  { name: 'Atlassian', text: true, className: 'text-lg font-medium' },
  { name: 'Shopify', text: true, className: 'text-lg font-semibold' },
  { name: 'stripe', text: true, className: 'text-xl font-semibold lowercase' },
  { name: 'GitHub', text: true, className: 'text-lg font-bold' },
  { name: 'Notion', text: true, className: 'text-lg font-medium' },
  { name: 'Linear', text: true, className: 'text-lg font-medium tracking-tight' },
  { name: 'Slack', text: true, className: 'text-lg font-semibold' },
  { name: 'Asana', text: true, className: 'text-lg font-medium' },
  { name: 'IDEO', text: true, className: 'text-lg font-bold tracking-widest' },
  { name: 'Dropbox', text: true, className: 'text-lg font-semibold' },
];

/**
 * The component is written against `dark:`, which this page binds to a class
 * rather than the OS setting — see globals.css. The `dark` wrapper is what puts
 * it in its dark form here, and clearing its own background in both modes keeps
 * the strip on the page's #020204 instead of introducing a third shade.
 */
export function LogoCloudSection() {
  return (
    <div className="dark w-full">
      <CinematicLogoCloud
        clients={clients}
        className="bg-transparent dark:bg-transparent"
        eyebrow="Built for the way these teams already work."
        description="Planning, diagramming, and design review on one shared board."
      />
    </div>
  );
}
