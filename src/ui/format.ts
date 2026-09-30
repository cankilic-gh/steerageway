/** Compares names ignoring case, whitespace and punctuation. */
const normalizeName = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Briefing heading: "Mission: Variant", or just the mission title when the variant has the same name. */
export const briefingTitle = (missionTitle: string, variantName: string): string =>
  normalizeName(missionTitle) === normalizeName(variantName) ? missionTitle : `${missionTitle}: ${variantName}`;
