import type { NavLink } from "./types";

/** Navigation links shown in the mobile menu */
export const MOBILE_NAV_LINKS: NavLink[] = [
  { label: "Docs", href: "https://docs.opendiff.dev" },
  { label: "Blog", href: "/blog" },
  { label: "Changelog", href: "/changelog" },
  { label: "Sign in", href: `${import.meta.env.VITE_APP_URL || ""}/login` },
  { label: "Pricing", href: "/pricing" },
];


/** Key that opens the console login from anywhere on the site */
export const LOGIN_SHORTCUT_KEY = "l";

/** Announcement shown in the bar above the header */
export const ANNOUNCEMENT = {
  text: "Merge safety now ships with every review",
  linkLabel: "Read changelog",
  href: "/changelog",
};
