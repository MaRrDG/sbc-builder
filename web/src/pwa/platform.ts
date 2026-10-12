// Pure rules for the installable app (PWA): which platform, is it installed, what install help to offer.
export type InstallOffer = 'prompt' | 'ios' | null;

/** Installed and opened from the home screen: the display-mode query, or Safari's own flag on iOS. */
export const isStandalone = (displayModeStandalone: boolean, navigatorStandalone: boolean | undefined) =>
  displayModeStandalone || navigatorStandalone === true;

/** iPhone / iPod / iPad; iPadOS asks for desktop sites with a Mac user agent, so a "Mac" with touch is an iPad. */
export const isIos = (userAgent: string, maxTouchPoints: number) =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

/** A phone (not a tablet, not a desktop): Android browsers say "Mobile" only on phones. */
export const isPhone = (userAgent: string) => /iPhone|iPod/.test(userAgent) || (/Android/.test(userAgent) && /Mobile/.test(userAgent));

/** What install help we can give: the browser's own prompt, the iOS steps, or nothing (installed / not possible). */
export function installOffer(o: { standalone: boolean; ios: boolean; canPrompt: boolean }): InstallOffer {
  if (o.standalone) return null;
  if (o.canPrompt) return 'prompt';
  return o.ios ? 'ios' : null;
}

/** The one-time phone banner: only on phones that can install, never again after a dismiss or an install. */
export const bannerVisible = (o: { phone: boolean; offer: InstallOffer; dismissedAt: number | null; installedAt: number | null }) =>
  o.phone && o.offer !== null && o.dismissedAt === null && o.installedAt === null;
