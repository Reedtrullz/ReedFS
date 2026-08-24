import { expect, test } from '@playwright/test';
import { openRfs } from './helpers/rfsPage';

const ROUTE_SAMPLES = [
  ['ENBR:17', 'ENSB:09', /ENBR→ENSB/, /ENBR17_DEP\s+→\s+ENBR17_CLB/],
  ['ENVA:27', 'ENGM:01L', /ENVA→ENGM/, /ENVA27_DEP\s+→\s+ENVA27_CLB/],
  ['KSEA:16L', 'KPDX:10R', /KSEA→KPDX/, /KSEA16L_DEP\s+→\s+KSEA16L_CLB/],
] as const;

test.describe('runway-pair route builder', () => {
  test.describe.configure({ timeout: 90_000 });

  test('loads representative arbitrary runway-pair routes through visible controls', async ({ page }) => {
    await openRfs(page);

    await expect(page.getByRole('region', { name: 'Runway route builder' })).toBeVisible();

    for (const [origin, destination, routeName, activeLeg] of ROUTE_SAMPLES) {
      await page.getByLabel('Origin runway').selectOption(origin);
      await page.getByLabel('Destination runway').selectOption(destination);
      await page.getByRole('button', { name: /^Load Route$/ }).click();

      await expect(page.getByRole('status', { name: 'Generated route result' })).toHaveText(`${origin.replace(':', ' ')} → ${destination.replace(':', ' ')}`);
      const routeStatus = page.getByLabel('Route status');
      await expect(routeStatus).toContainText(routeName);
      await expect(routeStatus).toContainText(/GENERATED TRAINING ROUTE/i);
      await expect(routeStatus).toContainText(/Runway-pair route builder/i);
      await expect(routeStatus).toContainText(/LNAV\/VNAV\/SPD constraints are generated/i);
      await expect(routeStatus).toContainText(/LEG\s+1\/5/i);
      await expect(routeStatus).toContainText(activeLeg);
      await expect(routeStatus).toContainText(/DTG/i);
      await expect(routeStatus).toContainText(/TRK/i);
      await expect(routeStatus).not.toContainText(/not compatible/i);
    }
  });
});
