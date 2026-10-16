// Which onboarding a signed-in user without a linked EA account sees. Pure.
export type OnboardingMode = 'linking' | 'install' | 'phone';
export function onboardingMode({ present, phone, fromInstall }: { present: boolean; phone: boolean; fromInstall: boolean }): OnboardingMode {
  if (phone) return 'phone';
  return present || fromInstall ? 'linking' : 'install';
}

/** The Web Store listing installs the build that talks to production: any other origin (dev site, localhost) shows the zip first. */
export const storeFirst = (origin: string) => origin === 'https://fc-solver.app';
