"""CP-SAT model for SBC squads. Reads a problem as JSON on stdin, writes the answer on stdout.

The Node side (server/solver.ts) prepares everything game-specific: player costs,
in-position slots, chemistry groups/contributions and per-requirement player lists.
This file only knows about counts, thresholds and the squad-rating formula.
"""
import json
import os
import sys

from ortools.sat.python import cp_model

OPS = {">=": lambda a, b: a >= b, "<=": lambda a, b: a <= b, "=": lambda a, b: a == b}
PARAMS = ("1", "2", "3")  # nation, league, club
MAX_CHEM = 3


def solve(p):
    m = cp_model.CpModel()
    players = p["players"]
    n_slots = p["nSlots"]
    idx = range(len(players))
    # Locked ("brick") slots take no player; custom bricks still count in chemistry below.
    blocked = set(p.get("blocked") or [])
    bricks = p.get("bricks") or []
    open_slots = [s for s in range(n_slots) if s not in blocked]

    # x[i][s]: player i in slot s (only in-position pairs); off[i]: used out of position.
    x = {i: {s: m.NewBoolVar(f"x{i}_{s}") for s in pl["slots"]} for i, pl in enumerate(players)}
    off = [m.NewBoolVar(f"o{i}") for i in idx]
    used = [m.NewBoolVar(f"u{i}") for i in idx]
    inpos = [m.NewBoolVar(f"in{i}") for i in idx]
    for i in idx:
        m.Add(inpos[i] == sum(x[i].values()))
        m.Add(used[i] == inpos[i] + off[i])
    for s in range(n_slots):
        m.Add(sum(x[i][s] for i in idx if s in x[i]) <= 1)
    m.Add(sum(used) == len(open_slots))

    # Players the user already placed in the web app: keep as many as possible in their slot
    # (a preference, not a rule, since the placed squad may not meet the requirements).
    # Kept out of position, a player holds his slot without chemistry, so nobody else may take it.
    keep = {}  # player index -> (slot, bool var)
    for i, pl in enumerate(players):
        s = pl.get("fixed")
        if s is None:
            continue
        k = m.NewBoolVar(f"keep{i}")
        if s in x[i]:
            m.Add(x[i][s] == 1).OnlyEnforceIf(k)
        else:
            m.Add(off[i] == 1).OnlyEnforceIf(k)
            for j in idx:
                if s in x[j]:
                    m.Add(x[j][s] == 0).OnlyEnforceIf(k)
        keep[i] = (s, k)

    by_asset = {}
    for i, pl in enumerate(players):
        by_asset.setdefault(pl["asset"], []).append(i)
    for ids in by_asset.values():
        if len(ids) > 1:
            m.Add(sum(used[i] for i in ids) <= 1)

    # Squad rating, exact web-app formula scaled by 11:
    #   T = S + sum(max(0, r_i - S/11)),  rating = floor(round(T) / 11)
    # For a *fixed* rating sum S the bonus is linear in the chosen players, so we
    # one-hot the few S values near the target instead of modelling max() per player.
    r = p.get("rating") or {}
    rmin, rmax = r.get("min"), r.get("max")
    if rmin is not None or rmax is not None:
        S = m.NewIntVar(0, 99 * n_slots, "S")
        m.Add(S == sum(pl["rating"] * used[i] for i, pl in enumerate(players)))
        k_min = 121 * rmin - 5 if rmin is not None else None  # round(T) >= 11*R
        k_max = 121 * rmax + 115 if rmax is not None else None  # round(T) <= 11*R + 10
        span = 45
        if rmax is None:
            lo, hi = 11 * rmin - span, 11 * rmin - 1
        else:
            hi = 11 * rmax + 10
            lo = max(0, (11 * rmin if rmin is not None else hi) - span)
        choices = []
        for sv in range(max(lo, 0), hi + 1):
            z = m.NewBoolVar(f"S{sv}")
            m.Add(S == sv).OnlyEnforceIf(z)
            t11 = 11 * sv + sum(max(0, 11 * pl["rating"] - sv) * used[i] for i, pl in enumerate(players))
            if k_min is not None:
                m.Add(t11 >= k_min).OnlyEnforceIf(z)
            if k_max is not None:
                m.Add(t11 <= k_max).OnlyEnforceIf(z)
            choices.append(z)
        if rmax is None:
            big = m.NewBoolVar("S_high")  # sum alone already reaches the target
            m.Add(S >= 11 * rmin).OnlyEnforceIf(big)
            choices.append(big)
        elif rmin is None:
            low = m.NewBoolVar("S_low")  # far below the cap
            m.Add(S <= lo - 1).OnlyEnforceIf(low)
            choices.append(low)
        m.AddExactlyOne(choices)

    # Chemistry: group contributions from in-position players, nested thresholds.
    ch = None
    brick_ch = []
    if p.get("needsChem"):
        th = p["thresholds"]
        y = {}
        for par in PARAMS:
            groups = {}
            for i, pl in enumerate(players):
                v = pl["contrib"][par]
                if v > 0:
                    groups.setdefault(pl["groups"][par], []).append((i, v))
            fixed_part = {}  # custom bricks: always there, contribute when in position
            for b in bricks:
                v = b["contrib"][par]
                if v > 0 and b["inpos"]:
                    g = b["groups"][par]
                    groups.setdefault(g, [])
                    fixed_part[g] = fixed_part.get(g, 0) + v
            for g, members in groups.items():
                total = sum(v * inpos[i] for i, v in members) + fixed_part.get(g, 0)
                prev = None
                for k, (req, _pts) in enumerate(th[par]):
                    b = m.NewBoolVar(f"y{par}_{g}_{k}")
                    m.Add(total >= req).OnlyEnforceIf(b)
                    if prev is not None:
                        m.AddImplication(b, prev)
                    y[(par, g, k)] = b
                    prev = b
        ch = []
        for i, pl in enumerate(players):
            c = m.NewIntVar(0, MAX_CHEM, f"ch{i}")
            m.Add(c <= MAX_CHEM * inpos[i])
            if not pl["maxChem"]:
                terms = [
                    pts * y[(par, pl["groups"][par], k)]
                    for par in PARAMS
                    if (par, pl["groups"][par], 0) in y
                    for k, (_req, pts) in enumerate(th[par])
                ]
                m.Add(c <= sum(terms))
            ch.append(c)
        # a custom brick gets chemistry like a player in its slot
        for k, b in enumerate(bricks):
            c = m.NewIntVar(0, MAX_CHEM if b["inpos"] else 0, f"chb{k}")
            if not b["maxChem"]:
                terms = [
                    pts * y[(par, b["groups"][par], j)]
                    for par in PARAMS
                    if (par, b["groups"][par], 0) in y
                    for j, (_req, pts) in enumerate(th[par])
                ]
                m.Add(c <= sum(terms))
            brick_ch.append(c)

    def group_counts(par):
        groups = {}
        for i, pl in enumerate(players):
            groups.setdefault(pl["groups"][par], []).append(i)
        return {g: sum(used[i] for i in ids) for g, ids in groups.items()}

    for c in p["constraints"]:
        kind, op, v = c["kind"], c.get("op", ">="), c.get("value", 0)
        if kind == "count":
            m.Add(OPS[op](sum(used[i] for i in c["players"]), v))
        elif kind == "chemTotal":
            m.Add(OPS[op](sum(ch) + sum(brick_ch), v))
        elif kind == "chemEach":
            for i in idx:
                if op == ">=":
                    m.Add(ch[i] >= v).OnlyEnforceIf(used[i])
                elif op == "<=":
                    m.Add(ch[i] <= v).OnlyEnforceIf(used[i])
                else:
                    m.Add(ch[i] == v).OnlyEnforceIf(used[i])
            for c in brick_ch:  # custom bricks must reach it too
                m.Add(OPS[op](c, v))
        elif kind == "sameMax":
            counts = group_counts(c["param"])
            if op in (">=", "="):
                hit = []
                for g, cnt in counts.items():
                    b = m.NewBoolVar("")
                    m.Add(cnt >= v).OnlyEnforceIf(b)
                    hit.append(b)
                m.AddBoolOr(hit)
            if op in ("<=", "="):
                for cnt in counts.values():
                    m.Add(cnt <= v)
        elif kind == "distinct":
            present = []
            for g, cnt in group_counts(c["param"]).items():
                b = m.NewBoolVar("")
                m.Add(cnt >= 1).OnlyEnforceIf(b)
                m.Add(cnt == 0).OnlyEnforceIf(b.Not())
                present.append(b)
            m.Add(OPS[op](sum(present), v))
        else:
            raise ValueError(f"unknown constraint {kind}")

    # Costs are floats; CP-SAT wants integers. Keeping a placed player outweighs any cost.
    keep_bonus = 10_000_000
    m.Minimize(
        sum(int(round(pl["cost"] * 100)) * used[i] for i, pl in enumerate(players))
        - keep_bonus * sum(k for _s, k in keep.values())
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(p.get("timeLimit", 10))
    solver.parameters.num_workers = int(p.get("workers") or min(16, os.cpu_count() or 8))
    solver.parameters.relative_gap_limit = 0.005
    status = solver.Solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": solver.StatusName(status)}

    slots = [None] * n_slots
    offs = []
    for i in idx:
        if not solver.Value(used[i]):
            continue
        placed = [s for s, var in x[i].items() if solver.Value(var)]
        if placed:
            slots[placed[0]] = i
        elif i in keep and solver.Value(keep[i][1]):
            slots[keep[i][0]] = i
        else:
            offs.append(i)
    for s in open_slots:  # locked slots stay empty (None)
        if slots[s] is None:
            slots[s] = offs.pop()
    kept = [i for i, (_s, k) in keep.items() if solver.Value(k)]
    return {
        "status": solver.StatusName(status),
        "slots": slots,
        "kept": kept,
        "cost": (solver.ObjectiveValue() + keep_bonus * len(kept)) / 100,
        "wallTime": solver.WallTime(),
    }


if __name__ == "__main__":
    problem = json.load(sys.stdin)
    json.dump(solve(problem), sys.stdout)
