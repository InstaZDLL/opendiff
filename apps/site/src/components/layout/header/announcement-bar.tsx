import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "react-router-dom";
import { ANNOUNCEMENT } from "./header.constants";

/** Thin dark bar above the header with the current announcement */
export function AnnouncementBar() {
  return (
    <div className="flex h-10 w-full items-center justify-center bg-primary px-4 text-sm text-primary-foreground">
      <Link to={ANNOUNCEMENT.href} className="group flex items-center gap-2 truncate">
        <span className="truncate">{ANNOUNCEMENT.text}</span>
        <span className="hidden shrink-0 items-center gap-1 text-primary-foreground/60 transition-colors group-hover:text-primary-foreground sm:flex">
          <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
        </span>
      </Link>
    </div>
  );
}
