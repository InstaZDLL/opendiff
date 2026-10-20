import {
  BalanceScaleIcon,
  BookOpenTextIcon,
  Briefcase01Icon,
  ComputerIcon,
  GitCompareIcon,
  Github01Icon,
  Mail01Icon,
  News01Icon,
  Note01Icon,
  SecurityCheckIcon,
  SourceCodeIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

const DOCS_URL = "https://docs.opendiff.dev";

export interface NavigationMenuLink {
  label: string;
  description: string;
  icon: IconSvgElement;
  href: string;
}

export interface NavigationEntry {
  /** Opens a hover menu with these links */
  menu?: NavigationMenuLink[];
  /** Navigates directly when clicked */
  href?: string;
}

/** Header navigation next to the logo; entries with a menu open it on hover or focus */
export const NAVIGATION_ITEMS = {
  Product: {
    menu: [
      {
        label: "Code reviews",
        description: "AI review on every pull request",
        icon: SourceCodeIcon,
        href: "/",
      },
      {
        label: "Auto-fix",
        description: "Fixes committed back to your branch",
        icon: Wrench01Icon,
        href: DOCS_URL,
      },
      {
        label: "Merge safety",
        description: "Know when a pull request is safe to ship",
        icon: SecurityCheckIcon,
        href: DOCS_URL,
      },
      {
        label: "Rules & skills",
        description: "Teach reviews your team's conventions",
        icon: BalanceScaleIcon,
        href: DOCS_URL,
      },
      {
        label: "Editor extensions",
        description: "Review locally in Cursor and VS Code",
        icon: ComputerIcon,
        href: "https://marketplace.visualstudio.com/items?itemName=opendiff.opendiff-local-review",
      },
    ],
  },
  Resources: {
    menu: [
      {
        label: "Documentation",
        description: "Set up and configure Contrast",
        icon: BookOpenTextIcon,
        href: DOCS_URL,
      },
      {
        label: "Blog",
        description: "Notes on code review and shipping",
        icon: News01Icon,
        href: "/blog",
      },
      {
        label: "Changelog",
        description: "What's new in Contrast",
        icon: Note01Icon,
        href: "/changelog",
      },
      {
        label: "Comparisons",
        description: "How Contrast stacks up to other tools",
        icon: GitCompareIcon,
        href: "/comparisons",
      },
    ],
  },
  Company: {
    menu: [
      {
        label: "Careers",
        description: "Build the future of code review",
        icon: Briefcase01Icon,
        href: "https://careers.opendiff.dev",
      },
      {
        label: "GitHub",
        description: "Contrast is open source",
        icon: Github01Icon,
        href: "https://github.com/antiptrn/opendiff",
      },
      {
        label: "Contact",
        description: "Talk with the team",
        icon: Mail01Icon,
        href: "mailto:support@opendiff.dev",
      },
    ],
  },
  Pricing: { href: "/pricing" },
} as const satisfies Record<string, NavigationEntry>;

export type NavigationItem = keyof typeof NAVIGATION_ITEMS;
