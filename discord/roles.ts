// Picker roles: set the member's roles in one group to exactly the selection; other roles are never touched.
export function roleDiff(group: string[], has: Iterable<string>, selected: string[]): { add: string[]; remove: string[] } {
  const mine = new Set(has);
  const want = new Set(selected.filter((s) => group.includes(s)));
  return {
    add: group.filter((g) => want.has(g) && !mine.has(g)),
    remove: group.filter((g) => !want.has(g) && mine.has(g)),
  };
}
