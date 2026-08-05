// Moved to shared/dprGeometry.ts so the server can recompute geometry
// quantities with the exact same formulas (quantity-source verification).
// This file remains as a re-export so existing client imports keep working.
export {
  deriveDprUom,
  computeDprQty,
  boqUomProfile,
  resolveBoqUomProfile,
  type BoqUomProfile,
} from "@shared/dprGeometry";
