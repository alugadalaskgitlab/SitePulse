import { useSearch } from "wouter";

export function useOrigin() {
  const searchString = useSearch();
  const browserSearch = typeof window !== "undefined" ? window.location.search : "";
  const effectiveSearch = searchString || browserSearch;
  const isFromPortal = new URLSearchParams(effectiveSearch).get("origin") === "portal";
  
  const getBackLink = (defaultPath: string) => {
    return isFromPortal ? "/" : defaultPath;
  };
  
  const appendOrigin = (path: string) => {
    if (!isFromPortal) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}origin=portal`;
  };
  
  return {
    isFromPortal,
    getBackLink,
    appendOrigin,
  };
}
