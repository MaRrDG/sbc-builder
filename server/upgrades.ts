// Evolution upgrades. EA keeps a club item's base values in its fields and sends what an evolution
// changed only in `academyAttributes` ({ id: AcademyStatEnum, totalBonus }). Port of the web app's
// UTItemFactory.generateEvolutionUpgradeConstructorOptions + the UTItemEntity getters (rating, rareflag,
// possiblePositions, getSkillMoves, getWeakFoot, getAttribute): an upgrade, when present, wins over the base.
import type { ClubItem } from './ea.js';

export interface AcademyAttribute {
  id: number;
  totalBonus: number;
}

// AcademyStatEnum ids
const RARITY = 2;
const GK_DIVING = 5; // GK_DIVING..GK_POSITIONING = 5..10, the GK face stats in attributeArray order
const OVR = 11;
const PACE = 12; // PACE..PHYSICALITY = 12..17, the outfield face stats in attributeArray order
const PHYSICALITY = 17;
const GK_POSITIONING = 10;
const WEAK_FOOT = 81;
const SKILL_MOVES = 82;
/** CB 61 .. CF 74, in AcademyStatEnum order */
const POSITIONS = ['CB', 'RB', 'RWB', 'LB', 'LWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];
const FIRST_POSITION = 61;

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** The item as the web app shows it: evolved rating, rarity, positions, skill moves, weak foot and face stats. Pure. */
export function withUpgrades<T extends ClubItem>(item: T): T {
  const list: unknown[] = Array.isArray(item.academyAttributes) ? item.academyAttributes : [];
  const ups = list.filter((a): a is AcademyAttribute => !!a && typeof a === 'object' && Number.isInteger((a as AcademyAttribute).id) && isNum((a as AcademyAttribute).totalBonus));
  if (!ups.length) return item;
  const out: T = { ...item };
  const added: string[] = [];
  let attributes: number[] | undefined;
  for (const { id, totalBonus } of ups) {
    if (id === OVR) out.rating = totalBonus;
    else if (id === RARITY) out.rareflag = totalBonus;
    else if (id === SKILL_MOVES) out.skillmoves = totalBonus; // the item field is stars - 1, as EA's skillMoves = totalBonus + 1
    else if (id === WEAK_FOOT) out.weakfootabilitytypecode = totalBonus;
    else if ((id >= PACE && id <= PHYSICALITY) || (id >= GK_DIVING && id <= GK_POSITIONING)) {
      const at = id >= PACE ? id - PACE : id - GK_DIVING;
      attributes ??= [...(item.attributeArray ?? [])];
      if (at < attributes.length) attributes[at] = totalBonus;
    } else if (id >= FIRST_POSITION && id < FIRST_POSITION + POSITIONS.length) added.push(POSITIONS[id - FIRST_POSITION]);
  }
  if (attributes) out.attributeArray = attributes;
  // base positions without the added ones, then the added ones (UTItemEntity.possiblePositions)
  if (added.length) out.possiblePositions = [...item.possiblePositions.filter((p) => !added.includes(p)), ...added];
  return out;
}
