export const B737_FLAP_DETENTS = [0, 1, 2, 5, 10, 15, 25, 30, 40] as const;

export function nextB737FlapDetent(current: number): number {
  const currentIndex = B737_FLAP_DETENTS.findIndex((detent) => current <= detent);
  if (currentIndex < 0 || currentIndex === B737_FLAP_DETENTS.length - 1) return B737_FLAP_DETENTS[0];
  if (B737_FLAP_DETENTS[currentIndex] === current) return B737_FLAP_DETENTS[currentIndex + 1];
  return B737_FLAP_DETENTS[currentIndex];
}
