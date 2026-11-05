import type { ComponentPropsWithoutRef } from "react";

export type IconName = "jobs" | "profile" | "applications" | "settings" | "arrow" | "bookmark" | "location" | "menu" | "search" | "filter" | "check" | "clock" | "globe" | "chevron" | "grid" | "columns" | "wallet" | "calendar";
const paths: Record<IconName, string> = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  columns: "M3 4h18v16H3z M12 4v16",
  wallet: "M3 6h17v14H3z M3 6V4h15v2 M15 11h6v5h-6z M17 13.5h1",
  calendar: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4",
  filter: "M4 7h16 M7 12h10 M10 17h4 M8 4v6 M16 9v6",
  check: "M5 12l4 4L19 6",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18 M12 3c-5 5-5 13 0 18",
  chevron: "M9 5l7 7-7 7",
  jobs: "M8 6V4h8v2 M3 7h18v13H3z M3 12c6 3 12 3 18 0 M10 13h4",
  profile: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  applications: "M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5",
  settings: "M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  location: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M14 14l6 6",
};

/** Original decorative line icon. Label the containing control. @example <Icon name="jobs" /> */
export function Icon({ name, className = "", ...props }: ComponentPropsWithoutRef<"svg"> & { name: IconName }) {
  return <svg {...props} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={`size-5 shrink-0 ${className}`}><path d={paths[name]} /></svg>;
}
