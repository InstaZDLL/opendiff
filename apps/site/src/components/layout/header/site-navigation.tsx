import { HugeiconsIcon } from "@hugeicons/react";
import { Button, Card, cn } from "components";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  NAVIGATION_ITEMS,
  type NavigationEntry,
  type NavigationItem,
  type NavigationMenuLink,
} from "./site-navigation.constants";

const NAVIGATION_LABELS = Object.keys(NAVIGATION_ITEMS) as NavigationItem[];

const NAVIGATION_SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;
const MENU_VIEWPORT_PADDING = 8;
const MENU_ID = "site-navigation-menu";

const MotionCard = motion.create(Card);

function isInternal(href: string) {
  return href.startsWith("/");
}

/** Horizontal center for the menu: under the trigger, but kept inside the viewport */
function getMenuCenter(menuWidth: number | null, navigationRect: DOMRect, triggerRect: DOMRect) {
  const triggerCenter = triggerRect.left + triggerRect.width / 2;
  if (menuWidth === null) return triggerCenter - navigationRect.left;

  const halfMenuWidth = menuWidth / 2;
  const minimumCenter = halfMenuWidth + MENU_VIEWPORT_PADDING;
  const maximumCenter = window.innerWidth - halfMenuWidth - MENU_VIEWPORT_PADDING;
  const viewportCenter =
    minimumCenter > maximumCenter
      ? window.innerWidth / 2
      : Math.min(Math.max(triggerCenter, minimumCenter), maximumCenter);

  return viewportCenter - navigationRect.left;
}

function MenuLink({ link, onSelect }: { link: NavigationMenuLink; onSelect: () => void }) {
  const className =
    "flex items-center gap-3 rounded-lg p-2 pr-4 text-left transition-colors outline-none hover:bg-muted focus-visible:bg-muted";
  const content = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        <HugeiconsIcon icon={link.icon} className="size-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="text-foreground">{link.label}</span>
        <span className="text-sm text-muted-foreground">{link.description}</span>
      </span>
    </>
  );

  if (isInternal(link.href)) {
    return (
      <Link to={link.href} className={className} onClick={onSelect}>
        {content}
      </Link>
    );
  }

  const isWeb = link.href.startsWith("http");
  return (
    <a
      href={link.href}
      target={isWeb ? "_blank" : undefined}
      rel={isWeb ? "noreferrer" : undefined}
      className={className}
      onClick={onSelect}
    >
      {content}
    </a>
  );
}

/**
 * Header navigation next to the logo. Hovering or focusing a trigger slides a highlight under it
 * and opens a shared menu card that springs to the trigger and resizes to fit each menu.
 */
export function SiteNavigation() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [activeItem, setActiveItem] = useState<NavigationItem | null>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const [menuCenter, setMenuCenter] = useState(0);
  const [menuHeight, setMenuHeight] = useState<number | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const navigationRef = useRef<HTMLDivElement>(null);
  const menuCardRef = useRef<HTMLDivElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<NavigationItem, HTMLButtonElement | null>>>({});

  const activeEntry: NavigationEntry | null = activeItem ? NAVIGATION_ITEMS[activeItem] : null;
  const activeMenu = activeEntry?.menu ?? null;

  const measureTrigger = useCallback(
    (item: NavigationItem) => {
      const navigation = navigationRef.current;
      const trigger = triggerRefs.current[item];
      if (!navigation || !trigger) return;

      const navigationRect = navigation.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      setIndicator({ left: triggerRect.left - navigationRect.left, width: triggerRect.width });
      setMenuCenter(getMenuCenter(menuWidth, navigationRect, triggerRect));
    },
    [menuWidth]
  );

  const openMenu = useCallback(
    (item: NavigationItem) => {
      const currentEntry: NavigationEntry | null = activeItem ? NAVIGATION_ITEMS[activeItem] : null;
      // Coming from a trigger without a menu: let the card size itself afresh
      if (!currentEntry?.menu) {
        setMenuHeight(null);
        setMenuWidth(null);
      }
      measureTrigger(item);
      setActiveItem(item);
    },
    [activeItem, measureTrigger]
  );

  const close = useCallback(() => setActiveItem(null), []);

  // Keep the highlight and menu aligned when the layout or window changes
  useEffect(() => {
    if (!activeItem) return;

    const update = () => measureTrigger(activeItem);
    update();
    const observer = new ResizeObserver(update);
    if (navigationRef.current) observer.observe(navigationRef.current);
    window.addEventListener("resize", update);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [activeItem, measureTrigger]);

  // Size the card to its content so it can animate between menus
  useLayoutEffect(() => {
    if (!activeMenu) return;

    const measureMenu = () => {
      const card = menuCardRef.current;
      const content = menuContentRef.current;
      if (!card || !content) return;

      const style = window.getComputedStyle(card);
      const verticalChrome =
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom) +
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth);
      const horizontalChrome =
        Number.parseFloat(style.paddingLeft) +
        Number.parseFloat(style.paddingRight) +
        Number.parseFloat(style.borderLeftWidth) +
        Number.parseFloat(style.borderRightWidth);
      const nextHeight = Math.ceil(content.scrollHeight + verticalChrome);
      const nextWidth = Math.ceil(content.scrollWidth + horizontalChrome);

      setMenuHeight((current) => (current === nextHeight ? current : nextHeight));
      setMenuWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    measureMenu();
    const observer = new ResizeObserver(measureMenu);
    if (menuContentRef.current) observer.observe(menuContentRef.current);

    return () => observer.disconnect();
  }, [activeMenu, activeItem]);

  const movement = reduceMotion ? { duration: 0 } : NAVIGATION_SPRING;
  const contentTransition = reduceMotion ? { duration: 0 } : { duration: 0.16 };
  const fadeIn = reduceMotion ? { duration: 0 } : { duration: 0.14 };
  const fadeOut = reduceMotion ? { duration: 0 } : { duration: 0.12 };

  return (
    <nav aria-label="Site sections" className="ml-6 hidden items-center md:flex">
      <div
        ref={navigationRef}
        className="relative flex items-center gap-1"
        onPointerLeave={close}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) close();
        }}
      >
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 h-10 rounded-full bg-muted"
          initial={false}
          animate={{
            opacity: activeItem && indicator ? 1 : 0,
            x: indicator?.left ?? 0,
            width: indicator?.width ?? 0,
          }}
          transition={{ x: movement, width: movement, opacity: fadeIn }}
        />

        {NAVIGATION_LABELS.map((item) => {
          const entry: NavigationEntry = NAVIGATION_ITEMS[item];
          const isActive = activeItem === item;

          return (
            <Button
              key={item}
              ref={(element) => {
                triggerRefs.current[item] = element;
              }}
              type="button"
              variant="ghost"
              className={cn(
                "relative z-10 rounded-full px-2.5 hover:bg-transparent dark:hover:bg-transparent",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-controls={entry.menu ? MENU_ID : undefined}
              aria-expanded={entry.menu ? isActive : undefined}
              onClick={() => {
                if (!entry.href) return;
                close();
                if (isInternal(entry.href)) navigate(entry.href);
                else window.location.assign(entry.href);
              }}
              onFocus={() => openMenu(item)}
              onPointerEnter={() => openMenu(item)}
            >
              {item}
            </Button>
          );
        })}

        <AnimatePresence>
          {activeItem && activeMenu ? (
            <Fragment key={MENU_ID}>
              {/* Bridges the gap so moving down to the menu doesn't close it */}
              <motion.div
                aria-hidden="true"
                className="absolute top-10 left-0 h-2.5"
                initial={false}
                animate={{
                  left: menuCenter,
                  x: "-50%",
                  ...(menuWidth === null ? {} : { width: menuWidth }),
                }}
                transition={{ width: movement, left: movement }}
              />

              <motion.div
                id={MENU_ID}
                className="absolute top-[50px] left-0 z-10"
                initial={{ left: menuCenter, opacity: 0, scale: 0.98, x: "-50%", y: -6 }}
                animate={{ left: menuCenter, opacity: 1, scale: 1, x: "-50%", y: 0 }}
                exit={{ opacity: 0, scale: 0.98, x: "-50%", y: -6 }}
                transition={{
                  left: movement,
                  opacity: contentTransition,
                  scale: contentTransition,
                  y: contentTransition,
                }}
              >
                <MotionCard
                  ref={menuCardRef}
                  className="gap-0 rounded-xl border border-border bg-popover p-1.5 text-base"
                  initial={false}
                  animate={{
                    ...(menuWidth === null ? {} : { width: menuWidth }),
                    ...(menuHeight === null ? {} : { height: menuHeight }),
                  }}
                  transition={{ width: movement, height: movement }}
                >
                  <div className="relative h-full">
                    <AnimatePresence initial={false}>
                      <motion.div
                        ref={menuContentRef}
                        key={activeItem}
                        className={
                          menuHeight === null
                            ? "relative flex w-max flex-col gap-1"
                            : "absolute top-0 left-0 flex w-max flex-col gap-1"
                        }
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: fadeIn }}
                        exit={{ opacity: 0, transition: fadeOut }}
                      >
                        {activeMenu.map((link) => (
                          <MenuLink key={link.label} link={link} onSelect={close} />
                        ))}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </MotionCard>
              </motion.div>
            </Fragment>
          ) : null}
        </AnimatePresence>
      </div>
    </nav>
  );
}
