import { openForbiddenBlackbox } from './forbidden-helper';

export async function fixtureEntrypoint(): Promise<void> {
  await openForbiddenBlackbox();
}
