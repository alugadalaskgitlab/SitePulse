// Tank calibration — types and math functions
// All depths in cm (measured from the BOTTOM of the tank upward)
// All volumes in litres
// Three supported tank shapes cover the real-world cases seen in HMA/plant operations

export type HorizontalCylinderConfig = {
  shape: "horizontal_cylinder";
  diameterCm: number;
  lengthCm: number;
  deadStockDepthCm?: number;
};

export type VerticalCylinderConfig = {
  shape: "vertical_cylinder";
  diameterCm: number;
  heightCm: number;
  deadStockDepthCm?: number;
};

// Vertical cylinder body with a conical top (the cone tapers upward from the cylinder's
// full radius to a point/small opening at the apex). Fill level measured from bottom.
export type VerticalConeTopConfig = {
  shape: "vertical_cone_top";
  diameterCm: number;
  cylinderHeightCm: number;
  coneHeightCm: number;
  deadStockDepthCm?: number;
};

export type SingleTankConfig =
  | HorizontalCylinderConfig
  | VerticalCylinderConfig
  | VerticalConeTopConfig;

export type PlantTankConfig = {
  bitumen1?: SingleTankConfig;
  bitumen2?: SingleTankConfig;
  ldo1?: SingleTankConfig;
  ldo2?: SingleTankConfig;
};

export const TANK_SHAPE_LABELS: Record<string, string> = {
  horizontal_cylinder: "Horizontal Cylinder",
  vertical_cylinder: "Vertical Cylinder (flat top & bottom)",
  vertical_cone_top: "Vertical Cylinder + Conical Top",
};

export const TANK_SLOT_LABELS: Record<keyof PlantTankConfig, string> = {
  bitumen1: "Bitumen Tank 1",
  bitumen2: "Bitumen Tank 2",
  ldo1: "LDO Tank 1",
  ldo2: "LDO Tank 2",
};

export type TankSlot = keyof PlantTankConfig;

// Maximum possible dip depth for a given tank configuration
export function getTankMaxDepth(config: SingleTankConfig): number {
  if (config.shape === "horizontal_cylinder") return config.diameterCm;
  if (config.shape === "vertical_cylinder") return config.heightCm;
  return config.cylinderHeightCm + config.coneHeightCm;
}

// Total capacity in litres
export function getTankCapacity(config: SingleTankConfig): number {
  return calculateVolumeAtDepth(config, getTankMaxDepth(config));
}

// Dead stock depth (cm) — defaults to 0 if not set
export function getTankDeadStockDepth(config: SingleTankConfig): number {
  return config.deadStockDepthCm ?? 0;
}

// Volume (litres) at a given dip depth (cm from bottom) for any of the three shapes.
// Returns 0 for depth ≤ 0, capacity for depth ≥ max.
export function calculateVolumeAtDepth(config: SingleTankConfig, depthCm: number): number {
  if (depthCm <= 0) return 0;
  const r = config.diameterCm / 2;

  if (config.shape === "horizontal_cylinder") {
    const { diameterCm, lengthCm } = config;
    if (depthCm >= diameterCm) return (Math.PI * r * r * lengthCm) / 1000;
    const h = depthCm;
    // Horizontal cylinder segment formula: V = L × [r² × arccos((r-h)/r) - (r-h) × √(2rh-h²)]
    const vol =
      lengthCm *
      (r * r * Math.acos((r - h) / r) - (r - h) * Math.sqrt(2 * r * h - h * h));
    return vol / 1000;
  }

  if (config.shape === "vertical_cylinder") {
    const { heightCm } = config;
    if (depthCm >= heightCm) return (Math.PI * r * r * heightCm) / 1000;
    return (Math.PI * r * r * depthCm) / 1000;
  }

  if (config.shape === "vertical_cone_top") {
    const { cylinderHeightCm, coneHeightCm } = config;
    const maxDepth = cylinderHeightCm + coneHeightCm;
    const vCylFull = Math.PI * r * r * cylinderHeightCm;
    const vConeFull = (Math.PI * r * r * coneHeightCm) / 3;

    if (depthCm >= maxDepth) return (vCylFull + vConeFull) / 1000;

    if (depthCm <= cylinderHeightCm) {
      return (Math.PI * r * r * depthCm) / 1000;
    }

    // Inside the conical section — at height h_c above the cone's base, the
    // radius narrows from r (at base) to 0 (at apex): r_at_hc = r × (1 − h_c/H)
    // Integrate π×r_at_hc² from 0 to h_c:
    //   V_cone_partial = π×r² × [h_c - h_c²/H + h_c³/(3H²)]
    const h_c = depthCm - cylinderHeightCm;
    const H = coneHeightCm;
    const vConePartial =
      Math.PI * r * r * (h_c - (h_c * h_c) / H + (h_c * h_c * h_c) / (3 * H * H));
    return (vCylFull + vConePartial) / 1000;
  }

  return 0;
}

// Usable volume (litres) — total minus dead stock
export function calculateUsableVolume(config: SingleTankConfig, depthCm: number): number {
  const total = calculateVolumeAtDepth(config, depthCm);
  const deadStock = calculateVolumeAtDepth(config, getTankDeadStockDepth(config));
  return Math.max(0, total - deadStock);
}

// Generate a preview table for display in the calibration dialog.
// Returns readings at 10%, 25%, 50%, 75%, 90%, 100% of max depth.
export function generateChartPreview(
  config: SingleTankConfig
): { depthCm: number; volumeL: number; pct: number }[] {
  const maxDepth = getTankMaxDepth(config);
  return [10, 25, 50, 75, 90, 100].map((pct) => {
    const depthCm = Math.round((maxDepth * pct) / 100);
    return {
      depthCm,
      volumeL: Math.round(calculateVolumeAtDepth(config, depthCm)),
      pct,
    };
  });
}

// Parse tankConfig JSON string stored in the DB — returns null on any error
export function parseTankConfig(json: string | null | undefined): PlantTankConfig | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as PlantTankConfig;
  } catch {
    return null;
  }
}
