import { atom } from 'nanostores';

const kOnboardingShown = 'bolt_onboarding_shown';

export const onboardingStore = atom<boolean>(initStore());

function initStore() {
  if (typeof window !== 'undefined' && !import.meta.env.SSR) {
    const hasShownOnboarding = localStorage.getItem(kOnboardingShown);
    return hasShownOnboarding === 'true';
  }
  return false;
}

export function markOnboardingAsShown() {
  onboardingStore.set(true);
  localStorage.setItem(kOnboardingShown, 'true');
}
