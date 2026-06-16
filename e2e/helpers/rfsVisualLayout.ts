import { expect, type Page } from '@playwright/test';

interface PanelBox {
  kind: 'panel' | 'zone' | 'attribution';
  name: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export const RFS_LAYOUT_ASSERTION_VIEWPORTS = [
  { name: 'desktop-1280x720', width: 1280, height: 720 },
  { name: 'wide-desktop-1600x900', width: 1600, height: 900 },
] as const;

const CRITICAL_PANEL_NAMES = ['scenario', 'takeoff-setup', 'route', 'pfd', 'mcp', 'engine', 'controls'] as const;
const ATTRIBUTION_TARGET_PANEL_NAMES = ['controls', 'route', 'pfd', 'mcp'] as const;
const ATTRIBUTION_TARGET_ZONE_NAMES = ['flight-instruments'] as const;
const ATTRIBUTION_FALLBACK_PANEL_NAMES = ['scene-status', 'build-watermark'] as const;
const CESIUM_ATTRIBUTION_SELECTOR = '.cesium-widget-credits';
const CRITICAL_OVERLAP_AREA_THRESHOLD_PX2 = 12;
const VIEWPORT_BOUNDS_TOLERANCE_PX = 1;

function overlapArea(a: PanelBox, b: PanelBox): number {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

function contextLabel(context?: string): string {
  return context ? `${context}: ` : '';
}

async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function collectNamedBoxes(
  page: Page,
  selector: string,
  attribute: string | null,
  kind: PanelBox['kind'],
): Promise<PanelBox[]> {
  return page.locator(selector).evaluateAll((nodes, args) => {
    const { attribute: boxAttribute, kind: boxKind } = args as { attribute: string | null; kind: PanelBox['kind'] };

    return nodes.map((node) => {
      const style = window.getComputedStyle(node);
      const opacity = Number.parseFloat(style.opacity || '1');
      const rect = node.getBoundingClientRect();
      if (
        rect.width <= 0
        || rect.height <= 0
        || style.display === 'none'
        || style.visibility === 'hidden'
        || opacity === 0
      ) {
        return null;
      }

      return {
        kind: boxKind,
        name: boxAttribute ? node.getAttribute(boxAttribute) ?? 'unknown' : node.getAttribute('class') ?? node.tagName.toLowerCase(),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }).filter((box): box is PanelBox => box !== null);
  }, { attribute, kind });
}

async function collectPanelBoxes(page: Page): Promise<PanelBox[]> {
  return collectNamedBoxes(page, '[data-rfs-panel]', 'data-rfs-panel', 'panel');
}

async function collectZoneBoxes(page: Page): Promise<PanelBox[]> {
  return collectNamedBoxes(page, '[data-rfs-zone]', 'data-rfs-zone', 'zone');
}

async function collectCesiumAttributionBoxes(page: Page): Promise<PanelBox[]> {
  return collectNamedBoxes(page, CESIUM_ATTRIBUTION_SELECTOR, null, 'attribution');
}

function describeBox(box: PanelBox): string {
  return `${box.kind}:${box.name} (${box.left.toFixed(1)},${box.top.toFixed(1)}) ${box.width.toFixed(1)}×${box.height.toFixed(1)}`;
}

async function expectSourcesVisibleAndNotCoveringTargets(
  page: Page,
  sources: readonly PanelBox[],
  targets: readonly PanelBox[],
  context?: string,
): Promise<void> {
  const result = await page.evaluate(({ sources: sourceBoxes, targets: targetBoxes, sourceSelector, overlapThreshold }) => {
    type SerializableBox = {
      kind: 'panel' | 'zone' | 'attribution';
      name: string;
      left: number;
      right: number;
      top: number;
      bottom: number;
      width: number;
      height: number;
    };

    const describe = (box: SerializableBox) => `${box.kind}:${box.name} (${box.left.toFixed(1)},${box.top.toFixed(1)}) ${box.width.toFixed(1)}×${box.height.toFixed(1)}`;
    const area = (a: SerializableBox, b: SerializableBox) => {
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return x * y;
    };
    const selectorFor = (box: SerializableBox) => {
      if (box.kind === 'attribution') return sourceSelector;
      if (box.kind === 'zone') return `[data-rfs-zone="${box.name}"]`;
      return `[data-rfs-panel="${box.name}"]`;
    };
    const belongsTo = (element: Element | null, selector: string) => Boolean(element?.closest(selector));
    const samplePoints = (box: Pick<SerializableBox, 'left' | 'right' | 'top' | 'bottom'>) => {
      const insetX = Math.min(2, Math.max(0, (box.right - box.left) / 4));
      const insetY = Math.min(2, Math.max(0, (box.bottom - box.top) / 4));
      const left = box.left + insetX;
      const right = box.right - insetX;
      const top = box.top + insetY;
      const bottom = box.bottom - insetY;
      const centerX = (box.left + box.right) / 2;
      const centerY = (box.top + box.bottom) / 2;
      return [
        { x: centerX, y: centerY },
        { x: left, y: top },
        { x: right, y: top },
        { x: left, y: bottom },
        { x: right, y: bottom },
      ].filter((point) => point.x >= 0 && point.y >= 0 && point.x < window.innerWidth && point.y < window.innerHeight);
    };

    const hiddenSources = sourceBoxes.flatMap((source) => {
      const selector = selectorFor(source);
      const hasVisiblePoint = samplePoints(source).some((point) => belongsTo(document.elementFromPoint(point.x, point.y), selector));
      return hasVisiblePoint ? [] : [`${describe(source)} has no unobscured sample point`];
    });

    const coveringSources = sourceBoxes.flatMap((source) => targetBoxes.flatMap((target) => {
      const overlap = area(source, target);
      if (overlap <= overlapThreshold) return [];

      const intersection = {
        left: Math.max(source.left, target.left),
        right: Math.min(source.right, target.right),
        top: Math.max(source.top, target.top),
        bottom: Math.min(source.bottom, target.bottom),
      };
      const sourceBoxSelector = selectorFor(source);
      const targetSelector = selectorFor(target);
      const sourceIsTopmost = samplePoints(intersection).some((point) => {
        const topElement = document.elementFromPoint(point.x, point.y);
        return belongsTo(topElement, sourceBoxSelector) && !belongsTo(topElement, targetSelector);
      });

      return sourceIsTopmost
        ? [`${describe(source)} visually covers ${describe(target)} within ${overlap.toFixed(0)}px² of shared bounds`]
        : [];
    }));

    return { hiddenSources, coveringSources };
  }, {
    sources,
    targets,
    sourceSelector: CESIUM_ATTRIBUTION_SELECTOR,
    overlapThreshold: CRITICAL_OVERLAP_AREA_THRESHOLD_PX2,
  });

  expect(result.hiddenSources, `${contextLabel(context)}Cesium attribution/fallback must have visible pixels`).toEqual([]);
  expect(result.coveringSources, `${contextLabel(context)}Cesium attribution/fallback must not cover player controls, route, or PFD/MCP cluster`).toEqual([]);
}

function requireNamedBoxes(
  boxes: readonly PanelBox[],
  names: readonly string[],
  kind: PanelBox['kind'],
  context?: string,
): PanelBox[] {
  const matched = names.flatMap((name) => boxes.filter((box) => box.kind === kind && box.name === name));
  const missing = names.filter((name) => !matched.some((box) => box.name === name));
  expect(missing, `${contextLabel(context)}missing RFS ${kind} bounds`).toEqual([]);
  return matched;
}

export async function expectPrimaryPanelsDoNotCriticallyOverlap(page: Page, context?: string): Promise<void> {
  const boxes = await collectPanelBoxes(page);
  const critical = requireNamedBoxes(boxes, CRITICAL_PANEL_NAMES, 'panel', context);
  const overlaps: string[] = [];

  for (let i = 0; i < critical.length; i += 1) {
    for (let j = i + 1; j < critical.length; j += 1) {
      const area = overlapArea(critical[i], critical[j]);
      if (area > CRITICAL_OVERLAP_AREA_THRESHOLD_PX2) {
        overlaps.push(`${critical[i].name}<->${critical[j].name}:${area.toFixed(0)}px²`);
      }
    }
  }

  expect(overlaps, `${contextLabel(context)}critical RFS panel overlaps: ${overlaps.join(', ')}`).toEqual([]);
}

export async function expectFlightCriticalPanelsReachable(page: Page, context?: string): Promise<void> {
  const results = await page.evaluate(({ panelNames, viewportTolerance }) => {
    const pointWithinViewport = (value: number, max: number) => Math.max(0, Math.min(Math.max(0, max - 1), value));

    return panelNames.map((name) => {
      const element = document.querySelector(`[data-rfs-panel="${name}"]`) as HTMLElement | null;
      if (!element) return { name, ok: false, reason: 'missing' };

      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const opacity = Number.parseFloat(style.opacity || '1');
      const visible = rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && opacity !== 0;
      const withinViewport = rect.left >= -viewportTolerance
        && rect.top >= -viewportTolerance
        && rect.right <= window.innerWidth + viewportTolerance
        && rect.bottom <= window.innerHeight + viewportTolerance;
      const centerX = pointWithinViewport(rect.left + rect.width / 2, window.innerWidth);
      const centerY = pointWithinViewport(rect.top + rect.height / 2, window.innerHeight);
      const topElement = document.elementFromPoint(centerX, centerY);
      const hitPanel = topElement?.closest('[data-rfs-panel]');
      const receivesPointerAtCenter = Boolean(topElement && (topElement === element || element.contains(topElement) || hitPanel === element));

      return {
        name,
        ok: visible && withinViewport && receivesPointerAtCenter,
        reason: [
          visible ? null : 'not visible',
          withinViewport ? null : 'outside viewport',
          receivesPointerAtCenter ? null : 'center point is covered',
        ].filter(Boolean).join(', '),
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    });
  }, { panelNames: [...CRITICAL_PANEL_NAMES], viewportTolerance: VIEWPORT_BOUNDS_TOLERANCE_PX });

  const failures = results
    .filter((result) => !result.ok)
    .map((result) => `${result.name}: ${result.reason} ${JSON.stringify(result.rect)}`);
  expect(failures, `${contextLabel(context)}flight-critical panels must remain reachable`).toEqual([]);
}

export async function expectNormalPlayerModeNotCrowdedByDebugUi(page: Page, context?: string): Promise<void> {
  await expect(page.getByRole('button', { name: /OVL:\s*FLIGHT/i }), `${contextLabel(context)}normal overlay mode`).toBeVisible();
  await expect(page.locator('[data-rfs-panel="debug"]'), `${contextLabel(context)}debug panel is opt-in`).toHaveCount(0);
  await expect(page.locator('[data-rfs-zone="debug"]'), `${contextLabel(context)}debug zone is opt-in`).toHaveCount(0);
  await expect(page.locator('[data-rfs-debug-panel]'), `${contextLabel(context)}debug subpanels are opt-in`).toHaveCount(0);
  await expect(page.locator('[data-rfs-panel="fps"]'), `${contextLabel(context)}FPS monitor is debug-only`).toHaveCount(0);
  await expect(page.locator('[data-rfs-panel="build-watermark"]'), `${contextLabel(context)}debug build watermark is debug-only`).toHaveCount(0);
  await expect(page.getByRole('group', { name: /Controls settings/i }), `${contextLabel(context)}debug controls settings are hidden`).toHaveCount(0);
  await expectFlightCriticalPanelsReachable(page, context);
}

export async function expectDebugUiAppearsOnlyAfterExplicitOverlayControl(page: Page): Promise<void> {
  await expectNormalPlayerModeNotCrowdedByDebugUi(page, 'normal player mode before debug opt-in');

  await page.getByRole('button', { name: /OVL:\s*FLIGHT/i }).click();
  await expect(page.getByRole('button', { name: /OVL:\s*MINIMAL/i }), 'first overlay click enters minimal mode, not debug').toBeVisible();
  await expect(page.locator('[data-rfs-panel="debug"]'), 'minimal mode still hides debug panel').toHaveCount(0);
  await expect(page.locator('[data-rfs-zone="debug"]'), 'minimal mode still hides debug zone').toHaveCount(0);
  await expect(page.locator('[data-rfs-debug-panel]'), 'minimal mode still hides debug overlays').toHaveCount(0);

  await page.getByRole('button', { name: /OVL:\s*MINIMAL/i }).click();
  await expect(page.getByRole('button', { name: /OVL:\s*DEBUG/i }), 'second overlay click explicitly enables debug mode').toBeVisible();
  await expect(page.locator('[data-rfs-panel="debug"]')).toBeVisible();
  await expect(page.locator('[data-rfs-debug-panel]'), 'debug subpanels are mounted after opt-in').toHaveCount(4, { timeout: 15_000 });
  for (const panel of ['telemetry', 'help', 'settings', 'attitude']) {
    await expect(page.locator(`[data-rfs-debug-panel="${panel}"]`), `debug ${panel} panel appears after opt-in`).toBeVisible({ timeout: 15_000 });
  }
}

export async function expectCesiumAttributionCoexistsWithPlayerPanels(page: Page, context?: string): Promise<void> {
  await settleLayout(page);
  const [panelBoxes, zoneBoxes, attributionBoxes] = await Promise.all([
    collectPanelBoxes(page),
    collectZoneBoxes(page),
    collectCesiumAttributionBoxes(page),
  ]);
  const targetBoxes = [
    ...requireNamedBoxes(panelBoxes, ATTRIBUTION_TARGET_PANEL_NAMES, 'panel', context),
    ...requireNamedBoxes(zoneBoxes, ATTRIBUTION_TARGET_ZONE_NAMES, 'zone', context),
  ];

  const attributionOrFallback = attributionBoxes.length > 0
    ? attributionBoxes
    : panelBoxes.filter((box) => (ATTRIBUTION_FALLBACK_PANEL_NAMES as readonly string[]).includes(box.name));

  expect(
    attributionOrFallback.length,
    `${contextLabel(context)}Cesium attribution should be visible, or degraded-mode scene status/build watermark should stand in for it`,
  ).toBeGreaterThan(0);

  const viewportFailures = attributionOrFallback
    .filter((box) => box.left < -VIEWPORT_BOUNDS_TOLERANCE_PX
      || box.top < -VIEWPORT_BOUNDS_TOLERANCE_PX
      || box.right > (page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) + VIEWPORT_BOUNDS_TOLERANCE_PX
      || box.bottom > (page.viewportSize()?.height ?? Number.POSITIVE_INFINITY) + VIEWPORT_BOUNDS_TOLERANCE_PX)
    .map(describeBox);
  expect(viewportFailures, `${contextLabel(context)}attribution/fallback must stay inside viewport`).toEqual([]);

  await expectSourcesVisibleAndNotCoveringTargets(page, attributionOrFallback, targetBoxes, context);
}

export async function expectPlayerCockpitLayoutBoundaries(page: Page, context?: string): Promise<void> {
  await settleLayout(page);
  await expectNormalPlayerModeNotCrowdedByDebugUi(page, context);
  await expectPrimaryPanelsDoNotCriticallyOverlap(page, context);
  await expectCesiumAttributionCoexistsWithPlayerPanels(page, context);
}
