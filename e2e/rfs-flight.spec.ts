import { expect, test } from '@playwright/test';
import { openRfs, startRoll } from './helpers/rfsPage';
import { flyEnvaTakeoffToCleanClimb } from './helpers/rfsFlight';

test.describe('RFS playable flight loops', () => {
  test('ENVA tutorial reaches clean climb with phase-aware guidance', async ({ page }) => {
    await openRfs(page);
    await startRoll(page);

    const snapshot = await flyEnvaTakeoffToCleanClimb(page);

    expect(snapshot.weightOnWheels).toBe(false);
    expect(snapshot.gearDown).toBe(false);
    expect(snapshot.gearLever).toBe('UP');
    expect(snapshot.aglFt).toBeGreaterThan(200);
    expect(snapshot.iasKt).toBeGreaterThan(130);
    expect(snapshot.phase).toBe('climb');
    expect(snapshot.coachMessage).toMatch(/climb stable/i);
    expect(snapshot.checklistLabels).toContain('Gear up');
    expect(snapshot.checklistLabels).not.toContain('Gear down');
  });
});
