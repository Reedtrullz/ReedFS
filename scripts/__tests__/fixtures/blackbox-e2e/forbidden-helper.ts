import { useSimStore } from '../../../../src/store/simStore';

export async function openForbiddenBlackbox(): Promise<void> {
  useSimStore.setState({});
}
