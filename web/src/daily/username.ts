// Same rule as server/daily/username.ts: 3-16 of A-Z a-z 0-9 _ . -, at least one letter or digit.
// Its own tiny module so the Settings card can use it without pulling the Daily chunk in.
export const usernameOk = (u: string) => /^[A-Za-z0-9_.-]{3,16}$/.test(u) && /[A-Za-z0-9]/.test(u);
