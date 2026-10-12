import { useEffect, useState } from "react";

// Follow the same explicit data-theme / OS preference used by App.css.
export function useStatisticsTheme(): "dark" | "light" {
  const read = () => {
    const explicit = document.documentElement.dataset.theme;
    return explicit === "dark" ||
      (explicit !== "light" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
  };
  const [theme, setTheme] = useState<"dark" | "light">(read);
  useEffect(() => {
    const update = () => setTheme(read());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    preference.addEventListener("change", update);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
    };
  }, []);
  return theme;
}
