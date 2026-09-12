export function formatKsh(amount: number): string {
  return `KSh ${Math.round(amount).toLocaleString('en-KE')}`;
}
