import { PixelIcon } from '@/components/marketing/pixel-icon';
import { RevealText } from '@/components/marketing/reveal-text';
import { StackingUseCaseCards } from '@/components/marketing/stacking-use-case-cards';
import { Tag } from '@/components/marketing/tag';

export function UseCasesSection() {
  // No top border: the turn from paper to #020204 is the divider.
  return (
    <section id="use-cases" className="py-32 px-6 md:px-12 lg:px-20">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-16">
          <div>
            <PixelIcon type="collab" size={40} dark />
            <div className="mt-4">
              <Tag dark>USE CASES</Tag>
            </div>
            <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
              {'One board, however your \n team thinks.'}
            </RevealText>
          </div>
          <p className="text-sm text-white/45 leading-relaxed max-w-xs">
            Start from a blank canvas or a board someone shares with you. Everything works the same
            whether there are two of you or twenty.
          </p>
        </div>

        <StackingUseCaseCards />
      </div>
    </section>
  );
}
