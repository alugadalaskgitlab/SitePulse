import * as React from "react";

// Layout-only breakpoints. Role decides *which* workspace a user lands on
// (Field Home vs Dashboard); this hook only decides how that workspace is
// laid out on the current screen. Keep in sync with use-mobile.tsx's
// MOBILE_BREAKPOINT for the mobile boundary.
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export type DeviceType = "mobile" | "tablet" | "desktop";

function getDeviceType(width: number): DeviceType {
  if (width < MOBILE_BREAKPOINT) return "mobile";
  if (width < TABLET_BREAKPOINT) return "tablet";
  return "desktop";
}

export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = React.useState<DeviceType>(() =>
    typeof window !== "undefined" ? getDeviceType(window.innerWidth) : "desktop"
  );

  React.useEffect(() => {
    const onResize = () => setDeviceType(getDeviceType(window.innerWidth));
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return deviceType;
}
