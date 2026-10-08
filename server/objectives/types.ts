// EA objectives (GET /scmp/objective/categories/all, relayed from the web app) and what we derive from them.

export type Stat = 'PAC' | 'SHO' | 'PAS' | 'DRI' | 'DEF' | 'PHY';

/** Which players a condition accepts; every present field must match. */
export interface Filter {
  nation?: number[];
  league?: number[];
  club?: number[];
  rarity?: number[];
  position?: string; // "ST", "CAM" ...
  preferredOnly?: boolean; // "(Preferred position only)"
  attr?: { stat: Stat; min: number }; // "85+ Pace"
}

/** xi: somewhere in the starting 11; score / assist: in a slot where they score / create. */
export type Role = 'xi' | 'score' | 'assist';

export interface Condition {
  filter: Filter;
  role: Role;
  min: number;
}

export type Names = Record<'nation' | 'league' | 'club' | 'rarity', Record<string, string>>;

export interface EaAward {
  value: number;
  awardType: string;
  untradeable?: boolean;
  itemDataReduced?: { description?: string; itemType?: string; rating?: number } | null;
}

export interface EaObjective {
  objectiveId: number;
  name: string;
  description: string;
  state?: string; // missing = not started; "IN_PROGRESS" | "COMPLETED" | "REDEEMED"
  currentProgress?: number;
  multiplier: number;
  awards: EaAward[];
}

export interface EaGroup {
  groupId: number;
  title: string;
  startTime: number; // seconds
  endTime: number; // seconds, 0 = no end
  awardsList: EaAward[];
  objectives: EaObjective[];
}

export interface EaCategory {
  categoryId: number;
  name: string;
  groupsList: EaGroup[];
}

export interface ObjectiveView {
  id: number;
  name: string;
  description: string;
  progress: number;
  target: number;
  awards: EaAward[];
  conditions: Condition[];
  /** EA says COMPLETED / REDEEMED, or progress >= target: shown as done, never solvable */
  done: boolean;
}

export interface ObjectiveGroupView {
  id: number;
  title: string;
  category: string;
  endsAt: number | null; // ms, null = no end
  awards: EaAward[];
  objectives: ObjectiveView[];
}
