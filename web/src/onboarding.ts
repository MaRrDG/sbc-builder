// Which onboarding a signed-in user without a linked EA account sees. Pure.
export type OnboardingMode = 'linking' | 'install' | 'phone';
export function onboardingMode({ present, phone, fromInstall }: { present: boolean; phone: boolean; fromInstall: boolean }): OnboardingMode {
  if (phone) return 'phone';
  return present || fromInstall ? 'linking' : 'install';
}
