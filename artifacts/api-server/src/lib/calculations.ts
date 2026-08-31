export type RightsCalculation = {
  rights: number;
  funding: number;
};

export type MixedMergerCalculation = {
  shares: number;
  cash: number;
};

export type DividendWithholdingCalculation = {
  grossCash: number;
  withholdingAmount: number;
  netCash: number;
};

const assertFiniteNonNegative = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
};

const assertPositive = (value: number, name: string): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than zero`);
  }
};

const expandScientificNotation = (value: number): string => {
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  if (exponentText === undefined) return coefficient;

  const exponent = Number(exponentText);
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalIndex = whole.length + exponent;

  if (decimalIndex <= 0) {
    return `0.${"0".repeat(-decimalIndex)}${digits}`;
  }
  if (decimalIndex >= digits.length) {
    return `${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
};

/**
 * Round a calculation with decimal-string minor units, avoiding binary
 * floating-point errors at half-cent boundaries.
 */
export function roundCalculation(value: number, decimalPlaces: number): number {
  assertFiniteNonNegative(value, "value");
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError("decimalPlaces must be a non-negative integer");
  }

  const [whole, fractional = ""] = expandScientificNotation(value).split(".");
  const retained = fractional.slice(0, decimalPlaces).padEnd(decimalPlaces, "0");
  const nextDigit = fractional.charAt(decimalPlaces);
  let minorUnits = BigInt(`${whole}${retained}`);
  if (nextDigit >= "5") minorUnits += 1n;

  return Number(minorUnits) / 10 ** decimalPlaces;
}

export function calculateDividend(
  eligibleQuantity: number,
  cashRate: number,
  currencyDecimals = 2,
): number {
  assertFiniteNonNegative(eligibleQuantity, "eligibleQuantity");
  assertFiniteNonNegative(cashRate, "cashRate");
  return roundCalculation(eligibleQuantity * cashRate, currencyDecimals);
}

export function calculateDividendWithholding(
  eligibleQuantity: number,
  cashRate: number,
  withholdingRate: number,
  currencyDecimals = 2,
): DividendWithholdingCalculation {
  if (!Number.isFinite(withholdingRate) || withholdingRate < 0 || withholdingRate > 1) {
    throw new RangeError("withholdingRate must be between zero and one");
  }
  const grossCash = calculateDividend(eligibleQuantity, cashRate, currencyDecimals);
  const withholdingAmount = roundCalculation(grossCash * withholdingRate, currencyDecimals);
  const netCash = roundCalculation(grossCash - withholdingAmount, currencyDecimals);
  return { grossCash, withholdingAmount, netCash };
}

export function calculateSplit(
  eligibleQuantity: number,
  newShares: number,
  oldShares: number,
  shareDecimals = 6,
): number {
  assertFiniteNonNegative(eligibleQuantity, "eligibleQuantity");
  assertPositive(newShares, "newShares");
  assertPositive(oldShares, "oldShares");
  return roundCalculation(
    (eligibleQuantity * newShares) / oldShares,
    shareDecimals,
  );
}

export function calculateRights(
  eligibleQuantity: number,
  rightsGranted: number,
  sharesRequired: number,
  subscriptionPrice: number,
  options: { retainFractionalEntitlements?: boolean; shareDecimals?: number } = {},
): RightsCalculation {
  assertFiniteNonNegative(eligibleQuantity, "eligibleQuantity");
  assertPositive(rightsGranted, "rightsGranted");
  assertPositive(sharesRequired, "sharesRequired");
  assertFiniteNonNegative(subscriptionPrice, "subscriptionPrice");

  const rawRights = (eligibleQuantity * rightsGranted) / sharesRequired;
  const shareDecimals = options.shareDecimals ?? 6;
  const rights = options.retainFractionalEntitlements
    ? roundCalculation(rawRights, shareDecimals)
    : Math.floor(rawRights);

  return {
    rights,
    funding: roundCalculation(rights * subscriptionPrice, 2),
  };
}

export function calculateTender(
  eligibleQuantity: number,
  maximumPercentage: number,
  offerPrice: number,
  currencyDecimals = 2,
): number {
  assertFiniteNonNegative(eligibleQuantity, "eligibleQuantity");
  if (!Number.isFinite(maximumPercentage) || maximumPercentage < 0 || maximumPercentage > 1) {
    throw new RangeError("maximumPercentage must be between zero and one");
  }
  assertFiniteNonNegative(offerPrice, "offerPrice");
  return roundCalculation(
    eligibleQuantity * maximumPercentage * offerPrice,
    currencyDecimals,
  );
}

export function calculateMixedMerger(
  eligibleQuantity: number,
  shareRatio: number,
  cashPerShare: number,
  options: { shareDecimals?: number; currencyDecimals?: number } = {},
): MixedMergerCalculation {
  assertFiniteNonNegative(eligibleQuantity, "eligibleQuantity");
  assertFiniteNonNegative(shareRatio, "shareRatio");
  assertFiniteNonNegative(cashPerShare, "cashPerShare");

  return {
    shares: roundCalculation(
      eligibleQuantity * shareRatio,
      options.shareDecimals ?? 6,
    ),
    cash: roundCalculation(
      eligibleQuantity * cashPerShare,
      options.currencyDecimals ?? 2,
    ),
  };
}