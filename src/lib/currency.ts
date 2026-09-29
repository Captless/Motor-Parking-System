export const formatPeso = (n: number): string => '₱' + n.toLocaleString('en-PH');
export const formatPesoCompact = (n: number): string => {
  if (n < 1000) return `₱${n}`;
  if (n < 10000) return `₱${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `₱${Math.round(n / 1000)}k`;
};
