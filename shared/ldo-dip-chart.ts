import { LDO_DENSITY_KG_PER_LITER } from "./bitumen-dip-chart";

export const LDO_TANK1_DIAMETER_CM = 229.6;
export const LDO_TANK1_HEIGHT_CM = 150;
export const LDO_TANK1_DEAD_STOCK_DEPTH_CM = 8;
export const LDO_TANK1_RADIUS_CM = LDO_TANK1_DIAMETER_CM / 2;
export const LDO_TANK1_CAPACITY_LITERS = Math.PI * Math.pow(LDO_TANK1_RADIUS_CM, 2) * LDO_TANK1_HEIGHT_CM / 1000;

export const LDO_TANK2_DIAMETER_CM = 250;
export const LDO_TANK2_LENGTH_CM = 750;
export const LDO_TANK2_DEAD_STOCK_DEPTH_CM = 13;
export const LDO_TANK2_CAPACITY_LITERS = 36816;

export const LDO_TANK2_DIP_CHART: { depth: number; volume: number }[] = [
  { depth: 1, volume: 16 },
  { depth: 2, volume: 45 },
  { depth: 3, volume: 82 },
  { depth: 4, volume: 126 },
  { depth: 5, volume: 176 },
  { depth: 6, volume: 231 },
  { depth: 7, volume: 290 },
  { depth: 8, volume: 354 },
  { depth: 9, volume: 422 },
  { depth: 10, volume: 494 },
  { depth: 11, volume: 569 },
  { depth: 12, volume: 648 },
  { depth: 13, volume: 729 },
  { depth: 14, volume: 814 },
  { depth: 15, volume: 902 },
  { depth: 16, volume: 992 },
  { depth: 17, volume: 1085 },
  { depth: 18, volume: 1181 },
  { depth: 19, volume: 1279 },
  { depth: 20, volume: 1380 },
  { depth: 21, volume: 1483 },
  { depth: 22, volume: 1588 },
  { depth: 23, volume: 1695 },
  { depth: 24, volume: 1805 },
  { depth: 25, volume: 1916 },
  { depth: 26, volume: 2030 },
  { depth: 27, volume: 2145 },
  { depth: 28, volume: 2262 },
  { depth: 29, volume: 2381 },
  { depth: 30, volume: 2502 },
  { depth: 31, volume: 2625 },
  { depth: 32, volume: 2750 },
  { depth: 33, volume: 2876 },
  { depth: 34, volume: 3003 },
  { depth: 35, volume: 3133 },
  { depth: 36, volume: 3264 },
  { depth: 37, volume: 3396 },
  { depth: 38, volume: 3530 },
  { depth: 39, volume: 3665 },
  { depth: 40, volume: 3802 },
  { depth: 41, volume: 3940 },
  { depth: 42, volume: 4080 },
  { depth: 43, volume: 4221 },
  { depth: 44, volume: 4363 },
  { depth: 45, volume: 4506 },
  { depth: 46, volume: 4651 },
  { depth: 47, volume: 4797 },
  { depth: 48, volume: 4944 },
  { depth: 49, volume: 5092 },
  { depth: 50, volume: 5242 },
  { depth: 51, volume: 5392 },
  { depth: 52, volume: 5544 },
  { depth: 53, volume: 5697 },
  { depth: 54, volume: 5850 },
  { depth: 55, volume: 6005 },
  { depth: 56, volume: 6161 },
  { depth: 57, volume: 6318 },
  { depth: 58, volume: 6476 },
  { depth: 59, volume: 6635 },
  { depth: 60, volume: 6794 },
  { depth: 61, volume: 6955 },
  { depth: 62, volume: 7116 },
  { depth: 63, volume: 7279 },
  { depth: 64, volume: 7442 },
  { depth: 65, volume: 7606 },
  { depth: 66, volume: 7771 },
  { depth: 67, volume: 7937 },
  { depth: 68, volume: 8103 },
  { depth: 69, volume: 8270 },
  { depth: 70, volume: 8438 },
  { depth: 71, volume: 8607 },
  { depth: 72, volume: 8777 },
  { depth: 73, volume: 8947 },
  { depth: 74, volume: 9118 },
  { depth: 75, volume: 9289 },
  { depth: 76, volume: 9461 },
  { depth: 77, volume: 9634 },
  { depth: 78, volume: 9808 },
  { depth: 79, volume: 9982 },
  { depth: 80, volume: 10156 },
  { depth: 81, volume: 10331 },
  { depth: 82, volume: 10507 },
  { depth: 83, volume: 10684 },
  { depth: 84, volume: 10860 },
  { depth: 85, volume: 11038 },
  { depth: 86, volume: 11216 },
  { depth: 87, volume: 11394 },
  { depth: 88, volume: 11573 },
  { depth: 89, volume: 11752 },
  { depth: 90, volume: 11932 },
  { depth: 91, volume: 12112 },
  { depth: 92, volume: 12293 },
  { depth: 93, volume: 12474 },
  { depth: 94, volume: 12655 },
  { depth: 95, volume: 12837 },
  { depth: 96, volume: 13019 },
  { depth: 97, volume: 13202 },
  { depth: 98, volume: 13385 },
  { depth: 99, volume: 13568 },
  { depth: 100, volume: 13752 },
  { depth: 101, volume: 13936 },
  { depth: 102, volume: 14120 },
  { depth: 103, volume: 14304 },
  { depth: 104, volume: 14489 },
  { depth: 105, volume: 14674 },
  { depth: 106, volume: 14859 },
  { depth: 107, volume: 15044 },
  { depth: 108, volume: 15230 },
  { depth: 109, volume: 15416 },
  { depth: 110, volume: 15602 },
  { depth: 111, volume: 15788 },
  { depth: 112, volume: 15975 },
  { depth: 113, volume: 16161 },
  { depth: 114, volume: 16348 },
  { depth: 115, volume: 16535 },
  { depth: 116, volume: 16722 },
  { depth: 117, volume: 16909 },
  { depth: 118, volume: 17096 },
  { depth: 119, volume: 17283 },
  { depth: 120, volume: 17471 },
  { depth: 121, volume: 17658 },
  { depth: 122, volume: 17845 },
  { depth: 123, volume: 18033 },
  { depth: 124, volume: 18220 },
  { depth: 125, volume: 18408 },
  { depth: 126, volume: 18595 },
  { depth: 127, volume: 18783 },
  { depth: 128, volume: 18970 },
  { depth: 129, volume: 19158 },
  { depth: 130, volume: 19345 },
  { depth: 131, volume: 19532 },
  { depth: 132, volume: 19720 },
  { depth: 133, volume: 19907 },
  { depth: 134, volume: 20094 },
  { depth: 135, volume: 20281 },
  { depth: 136, volume: 20468 },
  { depth: 137, volume: 20654 },
  { depth: 138, volume: 20841 },
  { depth: 139, volume: 21027 },
  { depth: 140, volume: 21214 },
  { depth: 141, volume: 21400 },
  { depth: 142, volume: 21585 },
  { depth: 143, volume: 21771 },
  { depth: 144, volume: 21957 },
  { depth: 145, volume: 22142 },
  { depth: 146, volume: 22327 },
  { depth: 147, volume: 22511 },
  { depth: 148, volume: 22696 },
  { depth: 149, volume: 22880 },
  { depth: 150, volume: 23064 },
  { depth: 151, volume: 23247 },
  { depth: 152, volume: 23431 },
  { depth: 153, volume: 23614 },
  { depth: 154, volume: 23796 },
  { depth: 155, volume: 23978 },
  { depth: 156, volume: 24160 },
  { depth: 157, volume: 24342 },
  { depth: 158, volume: 24523 },
  { depth: 159, volume: 24703 },
  { depth: 160, volume: 24883 },
  { depth: 161, volume: 25063 },
  { depth: 162, volume: 25243 },
  { depth: 163, volume: 25421 },
  { depth: 164, volume: 25600 },
  { depth: 165, volume: 25778 },
  { depth: 166, volume: 25955 },
  { depth: 167, volume: 26132 },
  { depth: 168, volume: 26308 },
  { depth: 169, volume: 26484 },
  { depth: 170, volume: 26659 },
  { depth: 171, volume: 26834 },
  { depth: 172, volume: 27008 },
  { depth: 173, volume: 27181 },
  { depth: 174, volume: 27354 },
  { depth: 175, volume: 27526 },
  { depth: 176, volume: 27698 },
  { depth: 177, volume: 27869 },
  { depth: 178, volume: 28039 },
  { depth: 179, volume: 28208 },
  { depth: 180, volume: 28377 },
  { depth: 181, volume: 28545 },
  { depth: 182, volume: 28712 },
  { depth: 183, volume: 28879 },
  { depth: 184, volume: 29045 },
  { depth: 185, volume: 29209 },
  { depth: 186, volume: 29374 },
  { depth: 187, volume: 29537 },
  { depth: 188, volume: 29699 },
  { depth: 189, volume: 29861 },
  { depth: 190, volume: 30021 },
  { depth: 191, volume: 30181 },
  { depth: 192, volume: 30340 },
  { depth: 193, volume: 30498 },
  { depth: 194, volume: 30654 },
  { depth: 195, volume: 30810 },
  { depth: 196, volume: 30965 },
  { depth: 197, volume: 31119 },
  { depth: 198, volume: 31272 },
  { depth: 199, volume: 31423 },
  { depth: 200, volume: 31574 },
  { depth: 201, volume: 31723 },
  { depth: 202, volume: 31872 },
  { depth: 203, volume: 32019 },
  { depth: 204, volume: 32165 },
  { depth: 205, volume: 32309 },
  { depth: 206, volume: 32453 },
  { depth: 207, volume: 32595 },
  { depth: 208, volume: 32736 },
  { depth: 209, volume: 32875 },
  { depth: 210, volume: 33013 },
  { depth: 211, volume: 33150 },
  { depth: 212, volume: 33286 },
  { depth: 213, volume: 33419 },
  { depth: 214, volume: 33552 },
  { depth: 215, volume: 33683 },
  { depth: 216, volume: 33812 },
  { depth: 217, volume: 33940 },
  { depth: 218, volume: 34066 },
  { depth: 219, volume: 34190 },
  { depth: 220, volume: 34313 },
  { depth: 221, volume: 34434 },
  { depth: 222, volume: 34553 },
  { depth: 223, volume: 34671 },
  { depth: 224, volume: 34786 },
  { depth: 225, volume: 34900 },
  { depth: 226, volume: 35011 },
  { depth: 227, volume: 35120 },
  { depth: 228, volume: 35228 },
  { depth: 229, volume: 35333 },
  { depth: 230, volume: 35436 },
  { depth: 231, volume: 35536 },
  { depth: 232, volume: 35634 },
  { depth: 233, volume: 35730 },
  { depth: 234, volume: 35823 },
  { depth: 235, volume: 35914 },
  { depth: 236, volume: 36001 },
  { depth: 237, volume: 36086 },
  { depth: 238, volume: 36168 },
  { depth: 239, volume: 36246 },
  { depth: 240, volume: 36322 },
  { depth: 241, volume: 36393 },
  { depth: 242, volume: 36461 },
  { depth: 243, volume: 36525 },
  { depth: 244, volume: 36585 },
  { depth: 245, volume: 36640 },
  { depth: 246, volume: 36690 },
  { depth: 247, volume: 36734 },
  { depth: 248, volume: 36771 },
  { depth: 249, volume: 36800 },
  { depth: 250, volume: 36816 },
];

export function getLdoTank1VolumeAtDepth(depthCm: number): number {
  if (depthCm <= 0) return 0;
  if (depthCm >= LDO_TANK1_HEIGHT_CM) return LDO_TANK1_CAPACITY_LITERS;
  return (Math.PI * Math.pow(LDO_TANK1_RADIUS_CM, 2) * depthCm) / 1000;
}

export function getLdoTank2VolumeAtDepth(depthCm: number): number {
  if (depthCm <= 0) return 0;
  if (depthCm >= LDO_TANK2_DIAMETER_CM) return LDO_TANK2_CAPACITY_LITERS;

  const lowerIndex = Math.floor(depthCm) - 1;
  const upperIndex = Math.ceil(depthCm) - 1;

  if (lowerIndex === upperIndex || Math.ceil(depthCm) === Math.floor(depthCm)) {
    return LDO_TANK2_DIP_CHART[lowerIndex].volume;
  }

  const lowerEntry = LDO_TANK2_DIP_CHART[lowerIndex];
  const upperEntry = LDO_TANK2_DIP_CHART[upperIndex];
  const fraction = depthCm - Math.floor(depthCm);

  return lowerEntry.volume + fraction * (upperEntry.volume - lowerEntry.volume);
}

export function getLdoVolumeAtDepth(tankNumber: number, depthCm: number): number {
  if (tankNumber === 1) return getLdoTank1VolumeAtDepth(depthCm);
  return getLdoTank2VolumeAtDepth(depthCm);
}

export function getLdoMaxDepth(tankNumber: number): number {
  if (tankNumber === 1) return LDO_TANK1_HEIGHT_CM;
  return LDO_TANK2_DIAMETER_CM;
}

export function getLdoCapacity(tankNumber: number): number {
  if (tankNumber === 1) return LDO_TANK1_CAPACITY_LITERS;
  return LDO_TANK2_CAPACITY_LITERS;
}

export function getLdoDeadStockDepth(tankNumber: number): number {
  if (tankNumber === 1) return LDO_TANK1_DEAD_STOCK_DEPTH_CM;
  return LDO_TANK2_DEAD_STOCK_DEPTH_CM;
}

export function getLdoDeadStockVolume(tankNumber: number): number {
  return getLdoVolumeAtDepth(tankNumber, getLdoDeadStockDepth(tankNumber));
}

export function getLdoUsableVolume(tankNumber: number, depthCm: number): number {
  const totalVolume = getLdoVolumeAtDepth(tankNumber, depthCm);
  const deadStockVolume = getLdoDeadStockVolume(tankNumber);
  return Math.max(0, totalVolume - deadStockVolume);
}
