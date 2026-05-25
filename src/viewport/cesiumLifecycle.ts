type DestroyableCesiumResource = {
  isDestroyed?: () => boolean;
};

export function isCesiumResourceDestroyed(resource: DestroyableCesiumResource): boolean {
  try {
    return resource.isDestroyed?.() ?? false;
  } catch {
    return true;
  }
}
