import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Runs `onPress` when `key` is pressed without modifiers,
 * unless the user is typing in a form field.
 */
export function useKeyboardShortcut(key: string, onPress: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || e.repeat) return;
      if (e.key.toLowerCase() !== key || isTypingTarget(e.target)) return;
      e.preventDefault();
      onPress();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [key, onPress]);
}
