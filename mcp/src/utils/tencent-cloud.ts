const REGION = {
    SHANGHAI: 'ap-shanghai',
    SINGAPORE: 'ap-singapore',
} as const;

export type Region = typeof REGION[keyof typeof REGION];

export const isInternationalRegion = (region: string | undefined) => region === REGION.SINGAPORE;
export function isValidRegion(region: string): region is Region {
    return Object.values(REGION).includes(region as Region);
}