export const formatPeso = (n: number): string => '₱' + n.toLocaleString('en-PH');
export const formatPesoCompact = (n: number): string => n < 1000 ? `₱${n}` : `₱${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '')}k`;
