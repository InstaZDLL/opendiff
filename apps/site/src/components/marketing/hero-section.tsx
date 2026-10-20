import { ConsoleMockup } from "./console-mockup";
import { LiveStat } from "./live-stat";
import { RotatingWord } from "./rotating-word";

const HERO_WORDS = ["bugs", "regressions", "security holes", "tech debt"] as const;

export function HeroSection() {
  return (
    <div id="overview" className="relative w-full overflow-hidden">
      <div className="relative z-10 mx-auto flex pt-44 pb-18 w-full max-w-6xl flex-col items-start justify-start px-8 text-left">
        <LiveStat />
        <h1 className="mt-6 max-w-[800px] text-4xl leading-16 tracking-tight md:text-6xl">
          Merge faster.
          <br />
          Leave out the{" "}
          {/* On phones the rotating word gets its own line, so the headline height never changes */}
          <br className="sm:hidden" />
          <RotatingWord words={HERO_WORDS} />
        </h1>
        <div className="mt-6">
          <p className="max-w-[560px] text-lg text-muted-foreground">Contrast reviews every pull request, flags bugs and security risks, and commits the fixes.</p>
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-6xl px-8 pb-32">
        <div className="relative">
          <ConsoleMockup />
        </div>
      </div>
    </div>
  );
}
