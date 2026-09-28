export const normalizePlate = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, ' ');
export const isValidPlate = (s: string): boolean => normalizePlate(s).length > 0 && normalizePlate(s).length <= 20;
