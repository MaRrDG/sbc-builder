/** Cut to `max` code points with an ellipsis; never splits an emoji. The one truncation helper of the bot. */
export const clip = (s: string, max: number) => {
  const cps = [...s];
  return cps.length <= max ? s : `${cps.slice(0, max - 1).join('')}…`;
};
