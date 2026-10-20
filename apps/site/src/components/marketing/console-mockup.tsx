import { Button } from "components";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";

/** Hero product shot: a frosted frame around an inner view with a play button */
export function ConsoleMockup() {
  return (
    <div className="flex h-[560px] flex-col rounded-2xl bg-muted p-3 backdrop-blur-xl">
      <div className="flex flex-1 items-center justify-center rounded-xl bg-background-solid">
        <Button type="button" variant="secondary" size="lg" className="rounded-full">
          <HugeiconsIcon icon={PlayIcon} className="size-5 fill-current" />
          Play
        </Button>
      </div>
    </div>
  );
}
