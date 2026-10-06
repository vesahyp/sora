//#region src/game/rng.ts
function hash32(x) {
	let h = x | 0;
	h = Math.imul(h ^ h >>> 16, 569420461);
	h = Math.imul(h ^ h >>> 13, 1935289751);
	return (h ^ h >>> 16) >>> 0;
}
//#endregion
//#region src/game/track.ts
/**
* A shortcut lane as the sim drives it: the open polyline smoothed and
* sampled like the road, with its own arc length `u` from the entry. It
* answers where a point is along and off it (`locate`), where the lane is
* at `u` (`at`), and how it bends ahead, the way the Track does for the
* road; and it knows where it joins the lap (`entryS`, `exitS`).
*/
var Lane = class {
	def;
	pts = [];
	length;
	width;
	surface;
	/** arc length on the lap where the lane leaves the road and where it comes back */
	entryS = 0;
	exitS = 0;
	constructor(def) {
		this.def = def;
		this.width = def.width;
		this.surface = def.surface;
		const P = def.points;
		const n = P.length;
		const per = 8;
		let s = 0;
		let prev = null;
		const at = (i) => P[Math.max(0, Math.min(n - 1, i))];
		for (let i = 0; i < n - 1; i++) {
			const [p0, p1, p2, p3] = [
				at(i - 1),
				at(i),
				at(i + 1),
				at(i + 2)
			];
			for (let k = 0; k < per; k++) {
				const t = k / per;
				const x = catmull(p0[0], p1[0], p2[0], p3[0], t);
				const y = catmull(p0[1], p1[1], p2[1], p3[1], t);
				if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
				this.pts.push({
					x,
					y,
					s,
					tx: 0,
					ty: 0
				});
				prev = [x, y];
			}
		}
		const last = P[n - 1];
		s += Math.hypot(last[0] - prev[0], last[1] - prev[1]);
		this.pts.push({
			x: last[0],
			y: last[1],
			s,
			tx: 0,
			ty: 0
		});
		this.length = s;
		const m = this.pts.length;
		for (let i = 0; i < m; i++) {
			const a = this.pts[Math.max(0, i - 1)];
			const b = this.pts[Math.min(m - 1, i + 1)];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const l = Math.hypot(dx, dy) || 1;
			this.pts[i].tx = dx / l;
			this.pts[i].ty = dy / l;
		}
	}
	/** The nearest point of the lane to (x, y): arc length `u` along it, the distance off it, and the point itself. */
	locate(x, y) {
		let best = 0;
		let bestD = Infinity;
		const pts = this.pts;
		for (let i = 0; i < pts.length; i++) {
			const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2;
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		}
		let out = {
			u: pts[best].s,
			dist: Math.sqrt(bestD),
			px: pts[best].x,
			py: pts[best].y
		};
		for (const j of [best - 1, best + 1]) {
			if (j < 0 || j >= pts.length) continue;
			const a = pts[Math.min(best, j)];
			const b = pts[Math.max(best, j)];
			const ex = b.x - a.x;
			const ey = b.y - a.y;
			const el = ex * ex + ey * ey || 1;
			const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / el));
			const px = a.x + ex * t;
			const py = a.y + ey * t;
			const dist = Math.hypot(x - px, y - py);
			if (dist < out.dist) out = {
				u: a.s + (b.s - a.s) * t,
				dist,
				px,
				py
			};
		}
		return out;
	}
	/** The lane's point and tangent at arc length u, held at the ends. */
	at(u) {
		const pts = this.pts;
		u = Math.max(0, Math.min(this.length, u));
		let i = Math.min(pts.length - 2, Math.floor(u / this.length * (pts.length - 1)));
		while (i > 0 && pts[i].s > u) i--;
		while (i < pts.length - 2 && pts[i + 1].s <= u) i++;
		const a = pts[i];
		const b = pts[i + 1];
		const t = b.s > a.s ? (u - a.s) / (b.s - a.s) : 0;
		return {
			x: a.x + (b.x - a.x) * t,
			y: a.y + (b.y - a.y) * t,
			s: u,
			tx: a.tx + (b.tx - a.tx) * t,
			ty: a.ty + (b.ty - a.ty) * t
		};
	}
	/** How much the lane turns over the next `ahead` metres, radians, signed (positive is right). */
	curvatureAhead(u, ahead) {
		const a = this.at(u);
		const b = this.at(u + ahead);
		return Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty);
	}
};
var Track = class {
	def;
	pts = [];
	length;
	width;
	/** grass between the road edge and the trees, metres */
	verge = 7;
	trees = [];
	/** the shortcuts, as lanes the sim can drive */
	lanes = [];
	bounds;
	cell = 20;
	grid = /* @__PURE__ */ new Map();
	/** the track's patches and its rivers' water, as patches */
	patches;
	/** the patches that touch each TILE metres of the lap, for surfaceAt */
	tiles = [];
	constructor(def) {
		this.def = def;
		this.width = def.width;
		const P = def.points;
		const n = P.length;
		const per = 8;
		let s = 0;
		let prev = null;
		for (let i = 0; i < n; i++) {
			const p0 = P[(i - 1 + n) % n];
			const p1 = P[i];
			const p2 = P[(i + 1) % n];
			const p3 = P[(i + 2) % n];
			for (let k = 0; k < per; k++) {
				const t = k / per;
				const x = catmull(p0[0], p1[0], p2[0], p3[0], t);
				const y = catmull(p0[1], p1[1], p2[1], p3[1], t);
				if (prev) s += Math.hypot(x - prev[0], y - prev[1]);
				this.pts.push({
					x,
					y,
					s,
					tx: 0,
					ty: 0
				});
				prev = [x, y];
			}
		}
		const first = this.pts[0];
		this.length = s + Math.hypot(first.x - prev[0], first.y - prev[1]);
		const m = this.pts.length;
		for (let i = 0; i < m; i++) {
			const a = this.pts[(i - 1 + m) % m];
			const b = this.pts[(i + 1) % m];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const l = Math.hypot(dx, dy) || 1;
			this.pts[i].tx = dx / l;
			this.pts[i].ty = dy / l;
		}
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const p of this.pts) {
			minX = Math.min(minX, p.x);
			minY = Math.min(minY, p.y);
			maxX = Math.max(maxX, p.x);
			maxY = Math.max(maxY, p.y);
		}
		const pad = 90;
		this.bounds = {
			minX: minX - pad,
			minY: minY - pad,
			maxX: maxX + pad,
			maxY: maxY + pad
		};
		for (let i = 0; i < m; i++) {
			const p = this.pts[i];
			const key = this.key(Math.floor(p.x / this.cell), Math.floor(p.y / this.cell));
			const list = this.grid.get(key);
			if (list) list.push(i);
			else this.grid.set(key, [i]);
		}
		const nt = Math.ceil(this.length / TILE);
		for (let k = 0; k < nt; k++) this.tiles.push([]);
		this.patches = [...def.patches ?? [], ...(def.rivers ?? []).map((r) => ({
			surface: "water",
			s: r.s,
			to: r.s + r.gap
		}))];
		for (const p of this.patches) {
			for (let a = p.s; a < p.to; a += TILE) this.tiles[Math.floor((a % this.length + this.length) % this.length / TILE)].push(p);
			const last = this.tiles[Math.floor(((p.to - .01) % this.length + this.length) % this.length / TILE)];
			if (!last.includes(p)) last.push(p);
		}
		for (const sc of def.shortcuts ?? []) {
			const lane = new Lane(sc);
			lane.entryS = this.locate(sc.points[0][0], sc.points[0][1]).s;
			lane.exitS = this.locate(sc.points[sc.points.length - 1][0], sc.points[sc.points.length - 1][1]).s;
			this.lanes.push(lane);
		}
		this.plantTrees();
	}
	/** The nearest lane to a point and where the point is against it, or null without shortcuts. */
	laneAt(x, y) {
		let best = null;
		for (const lane of this.lanes) {
			const l = lane.locate(x, y);
			if (!best || l.dist < best.dist) best = {
				lane,
				...l
			};
		}
		return best;
	}
	/** Inside a shortcut lane, its verge included: on its surface, walled by its trees. */
	inLane(x, y) {
		const l = this.laneAt(x, y);
		return l && l.dist <= l.lane.width / 2 + 2 ? l.lane : null;
	}
	/** In a river that crosses the road, between the tree lines: nothing grows or stands there. */
	inRiver(x, y) {
		if (!this.patches.some((p) => p.surface === "water" && !p.d)) return false;
		const loc = this.locate(x, y);
		return Math.abs(loc.d) < this.width / 2 + this.verge && this.surfaceAt(loc.s, loc.d) === "water";
	}
	/**
	* The surface at (s, d): a patch if one covers the spot, else the road's
	* surface on it and grass off it. With the world point too, a shortcut
	* lane's surface where the point is inside one.
	*/
	surfaceAt(s, d, x, y) {
		if (x !== void 0 && y !== void 0 && this.lanes.length) {
			const lane = this.inLane(x, y);
			if (lane) return lane.surface;
		}
		s = (s % this.length + this.length) % this.length;
		for (const p of this.tiles[Math.floor(s / TILE)] ?? []) {
			if (!inSpan(s, p.s, p.to, this.length)) continue;
			if (p.d && (d < p.d[0] || d > p.d[1])) continue;
			return p.surface;
		}
		return Math.abs(d) <= this.width / 2 ? this.def.surface : "grass";
	}
	/**
	* The ground's height at (s, d), metres over the road: a river's banks and water, a crest's
	* brow, zero elsewhere. Both span the road and the verge, so `d` does not matter; it is kept
	* for a feature that will not.
	*/
	groundAt(s, _d) {
		const L = this.length;
		for (const r of this.def.rivers ?? []) {
			const x = ((s - (r.s - RIVER.ramp)) % L + L) % L;
			if (x >= RIVER.ramp + r.gap + RIVER.out) continue;
			return riverHeight(r, x);
		}
		for (const c of this.def.crests ?? []) {
			const x = ((s - (c.s - c.len / 2)) % L + L) % L;
			if (x < c.len) return c.h * (1 - Math.cos(2 * Math.PI * x / c.len)) / 2;
		}
		return 0;
	}
	key(cx, cy) {
		return (cx + 4096) * 8192 + (cy + 4096);
	}
	/** Nearest centreline sample to a point, by the cell grid, falling back to a full scan far from the road. */
	locate(x, y) {
		const cx = Math.floor(x / this.cell);
		const cy = Math.floor(y / this.cell);
		let best = -1;
		let bestD = Infinity;
		for (let r = 1; r <= 2 && best < 0; r++) for (let i = cx - r; i <= cx + r; i++) for (let j = cy - r; j <= cy + r; j++) {
			const list = this.grid.get(this.key(i, j));
			if (!list) continue;
			for (const k of list) {
				const p = this.pts[k];
				const d = (p.x - x) ** 2 + (p.y - y) ** 2;
				if (d < bestD) {
					bestD = d;
					best = k;
				}
			}
		}
		if (best < 0) for (let k = 0; k < this.pts.length; k++) {
			const p = this.pts[k];
			const d = (p.x - x) ** 2 + (p.y - y) ** 2;
			if (d < bestD) {
				bestD = d;
				best = k;
			}
		}
		return this.refine(best, x, y);
	}
	/** Project onto the segment at the nearest sample for a smooth s and d. */
	refine(i, x, y) {
		const m = this.pts.length;
		const p = this.pts[i];
		const dx = x - p.x;
		const dy = y - p.y;
		const along = dx * p.tx + dy * p.ty;
		const j = along >= 0 ? (i + 1) % m : (i - 1 + m) % m;
		const q = this.pts[j];
		const ex = q.x - p.x;
		const ey = q.y - p.y;
		const el = ex * ex + ey * ey || 1;
		const t = Math.max(0, Math.min(1, (dx * ex + dy * ey) / el));
		const px = p.x + ex * t;
		const py = p.y + ey * t;
		const segLen = Math.sqrt(el);
		let s = along >= 0 ? p.s + segLen * t : p.s - segLen * t;
		if (along >= 0 && j === 0) s = p.s + segLen * t;
		s = (s % this.length + this.length) % this.length;
		const tx = along >= 0 ? ex / segLen : -ex / segLen;
		const ty = along >= 0 ? ey / segLen : -ey / segLen;
		const d = (x - px) * -ty + (y - py) * tx;
		return {
			s,
			d,
			i
		};
	}
	/** The centreline point and tangent at arc length s. */
	at(s) {
		s = (s % this.length + this.length) % this.length;
		const pts = this.pts;
		let i = Math.min(pts.length - 1, Math.floor(s / this.length * pts.length));
		while (i > 0 && pts[i].s > s) i--;
		while (i < pts.length - 1 && pts[i + 1].s <= s) i++;
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		const bs = i === pts.length - 1 ? this.length : b.s;
		const t = bs > a.s ? (s - a.s) / (bs - a.s) : 0;
		return {
			x: a.x + (b.x - a.x) * t,
			y: a.y + (b.y - a.y) * t,
			s,
			tx: a.tx + (b.tx - a.tx) * t,
			ty: a.ty + (b.ty - a.ty) * t
		};
	}
	/** How much the road turns over the next `ahead` metres, radians, signed (positive is right). */
	curvatureAhead(s, ahead) {
		const a = this.at(s);
		const b = this.at(s + ahead);
		return Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty);
	}
	/** Deterministic forest outside the verge; the renderer culls by view. */
	plantTrees() {
		const edge = this.width / 2 + this.verge;
		const row = (x, y, r, seed) => {
			if (this.inRiver(x, y)) return;
			this.trees.push({
				x,
				y,
				r,
				kind: seed & 3
			});
		};
		const WALL_STEP = 2.6;
		for (let s = 0; s < this.length; s += WALL_STEP) {
			const p = this.at(s);
			const h = hash32(Math.round(s * 7919) ^ 23505);
			const r = 1.7 + (h >>> 8 & 255) / 255 * .6;
			for (const side of [-1, 1]) {
				const d = side * (edge + r * .55);
				const x = p.x - p.ty * d;
				const y = p.y + p.tx * d;
				const lane = this.laneAt(x, y);
				if (lane && lane.dist < lane.lane.width / 2 + 2 + r) continue;
				if (Math.abs(this.locate(x, y).d) < edge) continue;
				row(x, y, r, h >>> 4);
			}
		}
		for (const lane of this.lanes) for (let u = 0; u < lane.length; u += WALL_STEP) {
			const p = lane.at(u);
			const h = hash32(Math.round(u * 6007) ^ 7997);
			const r = 1.6 + (h >>> 8 & 255) / 255 * .5;
			for (const side of [-1, 1]) {
				const d = side * (lane.width / 2 + 2 + r * .55);
				const x = p.x - p.ty * d;
				const y = p.y + p.tx * d;
				if (Math.abs(this.locate(x, y).d) < edge + r) continue;
				const other = this.laneAt(x, y);
				if (other && other.dist < other.lane.width / 2 + 2) continue;
				row(x, y, r, h >>> 4);
			}
		}
		const step = 4.5;
		const { minX, minY, maxX, maxY } = this.bounds;
		for (let gx = Math.floor(minX / step); gx * step < maxX; gx++) for (let gy = Math.floor(minY / step); gy * step < maxY; gy++) {
			const h = hash32(gx * 73856093 ^ gy * 19349663 ^ 7);
			if ((h & 255) < 40) continue;
			const x = gx * step + (h >>> 8 & 255) / 255 * step;
			const y = gy * step + (h >>> 16 & 255) / 255 * step;
			const near = this.locate(x, y);
			if (Math.abs(near.d) < edge + 1) continue;
			const lane = this.laneAt(x, y);
			if (lane && lane.dist < lane.lane.width / 2 + 2 + 1) continue;
			this.trees.push({
				x,
				y,
				r: 1.8 + (h >>> 24 & 255) / 255 * 1.6,
				kind: h >>> 4 & 3
			});
		}
	}
};
/**
* A river's shape along the lap (RiverDef): the near bank's climb in metres, the water's level
* under the road, the far bank's climb back out in metres.
*/
var RIVER = {
	ramp: 12,
	water: -.6,
	out: 8
};
/**
* The height at x metres from the foot of a river's near bank. The climb steepens toward the
* lip, so the car leaves it rising, the way a bank thrown up by a road does; the far bank is a
* plain slope a car in the water drives up.
*/
function riverHeight(r, x) {
	if (x < 0) return 0;
	if (x < RIVER.ramp) return r.bank * (x / RIVER.ramp) ** 2;
	if (x < RIVER.ramp + r.gap) return RIVER.water;
	const k = (x - RIVER.ramp - r.gap) / RIVER.out;
	return k < 1 ? RIVER.water * (1 - k) ** 2 : 0;
}
/** metres of lap per tile of the surface lookup */
var TILE = 4;
function inSpan(s, from, to, length) {
	return ((s - from) % length + length) % length < to - from;
}
function catmull(p0, p1, p2, p3, t) {
	const t2 = t * t;
	const t3 = t2 * t;
	return .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
//#endregion
//#region src/i18n.ts
var L = (fi, en = fi) => ({
	fi,
	en
});
//#endregion
//#region src/game/types.ts
var CLASS_RANK = {
	JM: 0,
	C: 1,
	B: 2,
	A: 3
};
//#endregion
//#region src/game/content/weapons.ts
var WEAPONS = [
	{
		id: "oil",
		name: L("Öljykanisteri", "Oil can"),
		desc: L("Vuotaa tielle itsestään, kun auto on ihan takanasi. Lätäkössä renkaat eivät pidä, ja perä lähtee.", "Leaks onto the road by itself when a car is right behind you. On the slick the tyres hold nothing and the tail goes."),
		price: 25,
		max: 9,
		from: "JM"
	},
	{
		id: "mine",
		name: L("Miina", "Mine"),
		desc: L("Putoaa itsestään, kun auto on ihan takanasi. Räjähtää alta.", "Drops itself when a car is right behind you. Goes off underneath."),
		price: 60,
		max: 9,
		from: "C"
	},
	{
		id: "missile",
		name: L("Ohjus", "Missile"),
		desc: L("Laukeaa itsestään, kun auto on pysynyt tähtäimessä hetken. Osuma pyöräyttää ja tekee ison reiän.", "Launches itself once a car has sat in the sights for a moment. A hit spins them and tears a hole."),
		price: 90,
		max: 9,
		from: "B"
	}
];
var WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
/** Can a car of this class carry this weapon. */
function canCarry(cls, id) {
	return CLASS_RANK[cls] >= CLASS_RANK[WEAPON_BY_ID[id].from];
}
/** What a car of this class takes into a race from a boot that holds all three. */
function carried(cls, boot) {
	return {
		oil: canCarry(cls, "oil") ? boot.oil : 0,
		mines: canCarry(cls, "mine") ? boot.mines : 0,
		missiles: canCarry(cls, "missile") ? boot.missiles : 0
	};
}
/** damage per thing (0..100 is a car) */
var DAMAGE = {
	bullet: .7,
	missile: 24,
	mine: 20,
	ram: .9,
	tree: 5
};
/**
* the machine gun: cone half-angle, range, shots a second, seconds of fire before it overheats,
* and `spray`, how much wider a skill-0 driver's spread is (times 1 - skill). Level 0 is no gun
*/
var GUN = {
	cone: .3,
	range: 22,
	rate: 9,
	heat: 2,
	cool: 1.6,
	holdOff: 3,
	spray: 4
};
/**
* Oil: a can leaks a slick when a car is this close behind on this line, at most one every
* `every` seconds; the slick is `r` metres across, lies for `life` seconds, and a tyre that
* crosses it keeps `grip` of its hold for `slick` seconds, the rear least (physics.ts),
* and takes `kick` rad/s on the yaw as it goes in, so the tail comes round.
*/
var OIL = {
	behind: 12,
	every: 4,
	r: 1.5,
	life: 30,
	slick: .9,
	grip: .3,
	rearGrip: .12,
	kick: 1.6
};
/** the missile: lock time, range, cone, speed over the car's, life, turn rate */
var MISSILE = {
	lock: .5,
	range: 24,
	cone: .45,
	speed: 42,
	life: 2.2,
	turn: 3.5,
	every: 2.5
};
var MINE = {
	behind: 14,
	every: 3.5,
	r: 1.6,
	life: 40
};
/** at 100 damage the car has lost this much of its pull and top speed */
var DAMAGE_PACE = .25;
/** boost: full meter seconds of nitro, the pull and top speed it adds, what fills it */
var BOOST = {
	seconds: 2.4,
	accel: 1.8,
	top: 1.3,
	perDriftSecond: .27,
	perWreck: 1,
	perRam: .1,
	burst: .34
};
/** the nitro part: the tank holds this much more a level, and the meter fills this much faster */
var NITRO = {
	tank: .25,
	fill: .15
};
/** seconds of nitro in a full tank for this car */
function nitroTank(def) {
	return BOOST.seconds * (1 + NITRO.tank * (def.nitro ?? 0));
}
/** what the meter's refills (a drift, a wreck, a ram) are multiplied by for this car */
function nitroFill(def) {
	return 1 + NITRO.fill * (def.nitro ?? 0);
}
/** ramming: closing speed above this hurts; a shove past this throws the victim into a spin */
var RAM = {
	minClosing: 4,
	spinClosing: 11
};
//#endregion
//#region src/game/content/pickups.ts
var PICKUPS = {
	cash: {
		kind: "cash",
		name: L("Rahaa", "Cash"),
		colour: "#ffd870",
		amount: 30
	},
	nitro: {
		kind: "nitro",
		name: L("Nitro", "Nitro"),
		colour: "#6ad0ff",
		amount: .5
	},
	wrench: {
		kind: "wrench",
		name: L("Korjaus", "Repair"),
		colour: "#8ae070",
		amount: 25
	},
	missile: {
		kind: "missile",
		name: L("Ohjus", "Missile"),
		colour: "#ff8a3a",
		amount: 1
	},
	mine: {
		kind: "mine",
		name: L("Miina", "Mine"),
		colour: "#e0e0e0",
		amount: 1
	},
	oil: {
		kind: "oil",
		name: L("Öljyä", "Oil"),
		colour: "#9a8c6a",
		amount: 1
	}
};
/**
* Off the line: a pickup sits this share of the half-width out from the
* centreline, sides alternating, cash furthest out. A car takes one when
* its centre comes within the reach, and the reach is less than the
* offset, so a car on the centreline drives past. Taking one is a line
* choice, which is the reason Death Rally put them on the road.
*/
var PICKUP_OFFSET = .6;
var PICKUP_OFFSET_CASH = .85;
/**
* The rotation of kinds along the lap. Cash is two in eight and small: the
* road tops the purse up, the fight is where the money is (WRECK_BOUNTY).
*/
var PICKUP_ORDER = [
	"cash",
	"nitro",
	"wrench",
	"missile",
	"nitro",
	"cash",
	"mine",
	"nitro"
];
/** The rotation for a race in this class: a weapon the class cannot carry grows as oil instead. */
function pickupOrder(cls) {
	return PICKUP_ORDER.map((k) => k === "missile" && !canCarry(cls, "missile") ? "oil" : k === "mine" && !canCarry(cls, "mine") ? "oil" : k);
}
//#endregion
//#region src/game/state.ts
var PLAYER = {
	name: {
		fi: "Sinä",
		en: "You"
	},
	skill: 1,
	aggression: 1,
	colour: "#c8352a"
};
var NO_AMMO = {
	missiles: 0,
	mines: 0,
	oil: 0
};
function createState(trackDef, playerCar, totalLaps, opponents = [], ammo = NO_AMMO, physics = "new") {
	const track = new Track(trackDef);
	const entries = [{
		driver: PLAYER,
		car: playerCar,
		...NO_AMMO,
		...ammo
	}, ...opponents];
	const cars = entries.map(({ driver, car, missiles = 0, mines = 0, oil = 0 }, i) => {
		const slot = i === 0 ? entries.length - 1 : i - 1;
		const row = Math.floor(slot / 2);
		const side = slot % 2 ? 1 : -1;
		const s = track.length - 7 - row * 7;
		const p = track.at(s);
		const d = side * Math.max(1.7, trackDef.width * .22);
		return {
			def: car,
			driver,
			x: p.x - p.ty * d,
			y: p.y + p.tx * d,
			heading: Math.atan2(p.ty, p.tx),
			vx: 0,
			vy: 0,
			yaw: 0,
			ax: 0,
			z: 0,
			vz: 0,
			air: false,
			surface: trackDef.surface,
			steer: 0,
			speed: 0,
			slip: 0,
			slipAngle: 0,
			sliding: false,
			slipF: 0,
			slipR: 0,
			handbrake: false,
			onRoad: true,
			hit: 0,
			s,
			d,
			half: false,
			lap: 1,
			lapStart: 0,
			laps: [],
			finishedAt: -1,
			progress: 0,
			damage: 0,
			wreck: 0,
			missiles,
			mines,
			oil,
			slick: 0,
			slickBy: -1,
			slickPaid: false,
			boost: .3,
			boosting: 0,
			heat: 0,
			overheated: false,
			target: -1,
			lockTime: 0,
			gunWait: 0,
			missileWait: 0,
			mineWait: 0,
			oilWait: 0,
			tailed: 0,
			spin: 0,
			stall: 0,
			stallX: 0,
			stallY: 0,
			backOut: 0,
			backSteer: 0,
			stuck: 0,
			stuckS: 0,
			wrecks: 0,
			wrecked: 0,
			rams: 0,
			rammed: 0,
			cash: 0,
			bounty: 0,
			ramCash: 0,
			shots: 0,
			grudge: entries.map(() => 0),
			lastHitBy: -1
		};
	});
	const pickups = [];
	const order = pickupOrder(playerCar.cls);
	const n = Math.floor(track.length / 85);
	for (let i = 0; i < n; i++) {
		const s = (i + .5) * track.length / n;
		const p = track.at(s);
		const kind = order[i % order.length];
		const d = (i % 2 ? 1 : -1) * (trackDef.width / 2) * (kind === "cash" ? PICKUP_OFFSET_CASH : PICKUP_OFFSET);
		pickups.push({
			kind,
			x: p.x - p.ty * d,
			y: p.y + p.tx * d,
			gone: 0
		});
	}
	return {
		time: 0,
		physics,
		track,
		cars,
		totalLaps,
		finished: false,
		hold: 2.5,
		bullets: [],
		missiles: [],
		mines: [],
		oils: [],
		pickups,
		fx: [],
		toasts: [],
		shake: 0,
		sounds: [],
		view: {
			w: 40,
			h: 70
		}
	};
}
/** The running order: finishers by flag time, then everyone by distance covered. */
function standings(s) {
	return s.cars.slice().sort((a, b) => {
		if (a.finishedAt >= 0 && b.finishedAt >= 0) return a.finishedAt - b.finishedAt;
		if (a.finishedAt >= 0) return -1;
		if (b.finishedAt >= 0) return 1;
		return b.progress - a.progress;
	});
}
//#endregion
//#region src/game/content/drivers.ts
/**
* The field. Three to race against; how hard the bot drives each one is
* the vehicle's `skill` in rivals.ts, per class. Aggression is how fast a
* grudge builds and how hard the bot leans, blocks and punts: Jorma is
* cold and fast and mostly just drives, Marko is the brawler who
* remembers every knock, Tapsa is timid. The player is red; these
* colours stay clear of it, and each rival's vehicles (rivals.ts) are
* painted in their driver's hue.
*/
var OPPONENTS = [
	{
		id: "jorma",
		name: L("Jorma"),
		aggression: .6,
		colour: "#2f6fd6"
	},
	{
		id: "marko",
		name: L("Marko"),
		aggression: 1.5,
		colour: "#e0b030"
	},
	{
		id: "tapsa",
		name: L("Tapsa"),
		aggression: .4,
		colour: "#f2f2ea"
	}
];
/**
* Grudges, Burnout's hostility arrow. A car that is rammed, shot, blown
* up or wrecked by another holds it against that car: these are what
* each costs, times the victim's aggression, up to `max`, decaying by
* `decay` a second so a full grudge outlasts a lap or two. A bullet is
* small because a burst is dozens of them. The race leader counts as
* `leader` of grudge to everyone behind it, so whoever leads draws the
* fire. The bot reads it, times its own aggression:
* - `lean`: how much harder it leans on that car alongside;
* - `punt`: past this it shoves the car ahead instead of passing it;
* - `block`: how far onto the line of a car within `blockReach` metres
*   behind it moves; a bot ahead of the player blocks at `blockAhead`
*   without a grudge, so the player has to fight through;
* - `wait`: with a grudge against the player up to `waitRange` metres
*   behind, it lifts by this per point of grudge, at most `waitMax`;
* - `aim` (in the sim): how much nearer that car looks to the guns.
* Read off tools/sim-check.ts: rams, wrecks and the view.
*/
var GRUDGE = {
	ram: .7,
	spin: 1,
	bullet: .03,
	blast: 1,
	wreck: 2,
	max: 3,
	decay: .04,
	leader: .5,
	lean: .5,
	punt: 1,
	block: .6,
	blockReach: 12,
	blockAhead: .5,
	wait: .15,
	waitMax: .3,
	waitRange: 60,
	aim: .6
};
/**
* Pacing to the player, Death Rally's trick (Burnout does it too): the
* opponents' cars run faster behind you and slower ahead of you, by the
* gap, so the field stays within a screen of you and the race is a
* fight, not a procession. The gap is measured along the track; it counts
* in full at `pushRange` metres behind you and `easeRange` metres ahead,
* about a screen either way. `engine` scales an opponent's top speed and
* pull in the sim (the player's car never changes); `corner` scales how
* hard the bot takes a bend. Read off sim-check and three drivers: a bot
* player that drives worse than the field (margin 0.55) finishes behind
* it, one that drives better (0.85) wins most Kiviaho races. Skill still
* orders the bots among themselves. Both are times catchUp(), the
* driver's skill squared: a JM rival barely rubber-bands, an A rival
* gets the whole push.
*/
var PACING = {
	pushRange: 20,
	easeRange: 15,
	engine: {
		push: .2,
		ease: .2
	},
	corner: {
		push: .4,
		ease: .25
	}
};
/**
* How far behind the player this car is, -1..1: positive when the player
* is ahead (push), negative when the car leads the player (ease off).
* Zero for the player's own car and once either has finished.
*/
function paceToPlayer(s, c) {
	const me = s.cars[0];
	if (c === me || me.finishedAt >= 0 || c.finishedAt >= 0) return 0;
	const gap = me.progress - c.progress;
	return Math.max(-1, Math.min(1, gap / (gap > 0 ? PACING.pushRange : PACING.easeRange)));
}
/** The factor on a car's top speed and pull from its gap to the player: 1 for the player. */
function enginePace(s, c) {
	const pace = paceToPlayer(s, c);
	return 1 + pace * catchUp(c) * (pace > 0 ? PACING.engine.push : PACING.engine.ease);
}
/**
* How much of PACING a driver gets: skill squared, so a JM rival (0.3 to 0.4) barely
* rubber-bands, a C rival gets about a third and an A rival all of it. Linear in skill
* handed a C rival back the player's pace whenever it fell behind (sim-check, 2026-10-04).
*/
function catchUp(c) {
	return c.driver.skill * c.driver.skill;
}
/** Index of the car leading the race on the road, or -1 once someone has the flag. */
function leaderOf(s) {
	let lead = -1;
	for (let k = 0; k < s.cars.length; k++) {
		const o = s.cars[k];
		if (o.finishedAt >= 0) return -1;
		if (lead < 0 || o.progress > s.cars[lead].progress) lead = k;
	}
	return lead;
}
/**
* How much car `c` wants a go at car `k`: its grudge, plus the leader's
* share if `k` leads and `c` does not. 0 for itself.
*/
function hostility(s, c, k, leader = leaderOf(s)) {
	if (s.cars[k] === c) return 0;
	return c.grudge[k] + (k === leader ? GRUDGE.leader : 0);
}
//#endregion
//#region src/game/harm.ts
/**
* What a hit does to the race, whichever car model moved the cars: damage
* with armour, the grudge it leaves, a spin, an explosion, and the
* consequences of a ram. The car models in physics.ts and physics-old.ts
* decide when two cars or a car and a tree meet; this decides what it costs.
*/
/** Damage with armour, and who did it. */
function hurt(s, c, dmg, by) {
	c.damage = Math.min(100, c.damage + dmg * (1 - .18 * c.def.armour));
	c.hit = 1;
	if (by >= 0 && by !== s.cars.indexOf(c)) c.lastHitBy = by;
}
/** The victim holds it against the one who did it, the more the hotter its driver. */
function anger(s, c, by, amount) {
	if (by < 0 || s.cars[by] === c) return;
	c.grudge[by] = Math.min(GRUDGE.max, c.grudge[by] + amount * c.driver.aggression);
}
/** A blast: the car loses speed, takes a kick on the yaw, and its tyres have little grip for a moment. */
function spin(s, c, k) {
	c.spin = 1;
	c.vx *= k;
	c.vy *= k;
	const kick = s.physics === "old" ? 5 : 3;
	c.yaw += (Math.sin(s.time * 13 + c.x) >= 0 ? 1 : -1) * kick;
	if (c === s.cars[0]) s.sounds.push("spin");
}
function boom(s, x, y, shake) {
	s.fx.push({
		kind: "boom",
		x,
		y,
		age: 0
	});
	s.sounds.push("boom");
	s.shake = Math.max(s.shake, shake);
}
/**
* Two cars met at `closing` m/s along the normal (nx, ny), pointing from
* car i to car j. Below RAM.minClosing it is a touch; above it, the one
* whose nose points along the contact rammed the other: damage both ways,
* the heavier doing more and a ram bar more still, a grudge, nitro for the
* rammer, and past RAM.spinClosing the victim is thrown and the rammer
* paid. `throwVictim` is how the car model throws a car: the old one
* kicks the yaw; in the new one the impulse has turned it already, and
* the throw only loosens its tyres for a moment.
*/
function ram(s, i, j, closing, nx, ny, x, y, throwVictim) {
	const a = s.cars[i];
	const b = s.cars[j];
	a.hit = b.hit = 1;
	if (closing < RAM.minClosing) return;
	const rammer = Math.cos(a.heading) * nx + Math.sin(a.heading) * ny >= -(Math.cos(b.heading) * nx + Math.sin(b.heading) * ny) ? a : b;
	const victim = rammer === a ? b : a;
	const ri = rammer === a ? i : j;
	const vi = rammer === a ? j : i;
	const force = (closing - RAM.minClosing) * DAMAGE.ram;
	const heft = Math.sqrt(rammer.def.mass / victim.def.mass);
	hurt(s, victim, force * heft * (1 + .35 * rammer.def.ram), ri);
	hurt(s, rammer, force * .35 * (1 / heft) * (1 - .25 * rammer.def.ram), vi);
	rammer.rams++;
	victim.rammed++;
	anger(s, victim, ri, GRUDGE.ram);
	rammer.boost = Math.min(1, rammer.boost + BOOST.perRam * nitroFill(rammer.def));
	if (closing > (rammer.def.spinOnShunt ? RAM.minClosing * 1.5 : RAM.spinClosing)) {
		throwVictim(victim);
		anger(s, victim, ri, GRUDGE.spin);
		const credit = 25 * (CLASS_RANK[victim.def.cls] + 1);
		rammer.ramCash += credit;
		if (rammer === s.cars[0]) s.toasts.push({
			text: {
				fi: `${victim.driver.name.fi} pyörähti! +${credit} cr`,
				en: `${victim.driver.name.en} spun! +${credit} cr`
			},
			colour: "#ffd870",
			age: 0
		});
	}
	s.fx.push({
		kind: "spark",
		x,
		y,
		age: 0
	});
	if (i === 0 || j === 0) {
		s.sounds.push(closing > RAM.spinClosing || rammer.def.spinOnShunt ? "crunch" : "bump");
		s.shake = Math.max(s.shake, Math.min(.6, closing / 25));
	}
}
function clamp(x, a, b) {
	return x < a ? a : x > b ? b : x;
}
function wrap(a) {
	while (a > Math.PI) a -= 2 * Math.PI;
	while (a < -Math.PI) a += 2 * Math.PI;
	return a;
}
//#endregion
//#region src/game/physics-old.ts
/**
* The car model as it was until 2026-10-03, kept reachable for one
* release at ?physics=old so the new one (physics.ts) can be compared
* on a phone. Delete this file, the `physics` field on SimState and the
* branch in step() with the release after.
*
* The bicycle model at one Euler step a frame, cars as circles pushed
* apart with a share of the closing speed traded, and the tree line as a
* clamp that keeps 60% of the speed every step the car touches it.
*/
/** Grass: the top speed the surface allows and how much of the grip is left on it. */
var GRASS_TOP = 30;
var GRASS_GRIP = .45;
/** a car is a circle of this radius when two meet */
var CAR_R = 1.5;
var G$1 = 9.81;
/** radians of slip at which a tyre gives all it has; past it the force is flat */
var ALPHA_PEAK = .12;
/** the rear tyres against the front: below 1 the rear lets go first, so the car rotates at the limit instead of plowing */
var REAR_GRIP$1 = .9;
/** centre of gravity height over the wheelbase: how much braking unloads the rear */
var CG_OVER_L$1 = .18;
function moveCar(s, c, input, dt) {
	const def = c.def;
	const t = s.track;
	const done = c.finishedAt >= 0;
	const want = clamp(input.steer, -1, 1);
	const rate = 9 * dt;
	c.steer += clamp(want - c.steer, -rate, rate);
	const fx = Math.cos(c.heading);
	const fy = Math.sin(c.heading);
	let vx = c.vx * fx + c.vy * fy;
	let vy = c.vx * -fy + c.vy * fx;
	let w = c.yaw;
	const onRoad = Math.abs(c.d) <= t.width / 2;
	const pace = (1 - DAMAGE_PACE * (c.damage / 100)) * enginePace(s, c);
	if (c.spin > 0) c.spin -= dt;
	const spinning = c.spin > 0;
	if (input.boost && !done && !spinning && c.boost > .05 && c.boosting <= 0) {
		c.boosting = Math.min(BOOST.seconds * BOOST.burst, c.boost * BOOST.seconds);
		if (c === s.cars[0]) s.sounds.push("nitro");
	}
	const boosting = c.boosting > 0;
	if (boosting) {
		c.boosting -= dt;
		c.boost = Math.max(0, c.boost - dt / BOOST.seconds);
	}
	const L = wheelbase(def);
	const b = L * .5;
	const cc = L - b;
	const k2 = (def.length * def.length + def.width * def.width) / 12 * .75;
	const delta = c.steer * steeringLock(def, vx);
	let mu = def.grip * (onRoad ? 1 : GRASS_GRIP);
	if (spinning) mu *= .3;
	const top = (onRoad ? def.topSpeed : GRASS_TOP) * pace * (boosting ? BOOST.top : 1);
	const throttle = done || spinning ? 0 : clamp(input.throttle, 0, 1);
	const pedal = done ? 1 : spinning ? 0 : clamp(input.brake, 0, 1);
	let drive = 0;
	if (vx < top) drive = Math.min(def.accel * pace * (boosting ? BOOST.accel : 1) * throttle * Math.max(0, 1 - vx / top), mu * 1.15);
	let ax = drive - vx * .12;
	if (vx > top) ax -= (vx - top) * 2;
	let braking = 0;
	c.handbrake = false;
	if (pedal > 0) {
		if (vx > .4) {
			braking = Math.min(def.brake * pedal, mu * 1.05, vx / dt);
			c.handbrake = vx > 6;
		} else if (vx > -5) ax -= Math.min(def.accel * .5 * pedal, mu);
	} else if (vx < 0) ax += Math.min(def.brake * .5, -vx / dt);
	ax -= braking;
	const usedR = clamp((drive * .8 + braking * .4) / mu, 0, .95);
	const usedF = clamp(braking * .6 / mu, 0, .95);
	const circleR = Math.sqrt(1 - usedR * usedR);
	const circleF = Math.sqrt(1 - usedF * usedF);
	const shift = clamp(CG_OVER_L$1 * c.ax / G$1, -.25, .25);
	const loadF = clamp(cc / L - shift, .15, .85);
	const loadR = clamp(b / L + shift, .15, .85);
	let muR = mu * REAR_GRIP$1;
	if (c.handbrake) muR *= .8;
	const capF = mu * loadF * circleF;
	const capR = muR * loadR * circleR;
	const vxs = Math.max(Math.abs(vx), 3);
	const alphaF = Math.atan2(vy + w * b, vxs) - delta;
	const alphaR = Math.atan2(vy - w * cc, vxs);
	const ayF = capF * clamp(-alphaF / ALPHA_PEAK, -1, 1);
	const ayR = capR * clamp(-alphaR / ALPHA_PEAK, -1, 1);
	c.sliding = (Math.abs(alphaR) > ALPHA_PEAK * 1.3 || Math.abs(alphaF) > ALPHA_PEAK * 1.3) && Math.abs(vx) > 2;
	const ay = ayR + ayF * Math.cos(delta) - vx * w;
	const axTotal = ax - ayF * Math.sin(delta) + vy * w;
	const wdot = (ayF * Math.cos(delta) * b - ayR * cc) / k2;
	const wKin = vx * Math.tan(delta) / L;
	const blend = clamp(Math.abs(vx) / 5, 0, 1);
	w += wdot * dt;
	w = wKin + (w - wKin) * blend;
	vx += axTotal * dt;
	vy += ay * dt;
	vy *= 1 - (1 - blend) * .5;
	c.ax = ax;
	c.yaw = w;
	c.heading += w * dt;
	const nfx = Math.cos(c.heading);
	const nfy = Math.sin(c.heading);
	c.vx = vx * nfx + vy * -nfy;
	c.vy = vx * nfy + vy * nfx;
	c.x += c.vx * dt;
	c.y += c.vy * dt;
	c.hit = 0;
	c.onRoad = onRoad;
	c.slipAngle = Math.abs(vx) > 1 ? Math.atan2(vy, Math.abs(vx)) : 0;
	if (Math.abs(c.slipAngle) > .2 && Math.abs(vx) > 9 && !spinning) c.boost = Math.min(1, c.boost + BOOST.perDriftSecond * dt);
}
/** Cars as circles: push overlapping pairs apart, trade the closing speed, and hurt the one that was hit. */
function collide(s) {
	const cars = s.cars;
	for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
		const a = cars[i];
		const b = cars[j];
		if (a.wreck > 0 || b.wreck > 0) continue;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const d = Math.hypot(dx, dy);
		const min = CAR_R * 2;
		if (d >= min || d === 0) continue;
		const nx = dx / d;
		const ny = dy / d;
		const ma = a.def.mass;
		const mb = b.def.mass;
		const push = min - d;
		a.x -= nx * push * (mb / (ma + mb));
		a.y -= ny * push * (mb / (ma + mb));
		b.x += nx * push * (ma / (ma + mb));
		b.y += ny * push * (ma / (ma + mb));
		const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
		if (closing <= 0) continue;
		const k = closing * .7;
		a.vx -= nx * k * (mb / (ma + mb)) * 2;
		a.vy -= ny * k * (mb / (ma + mb)) * 2;
		b.vx += nx * k * (ma / (ma + mb)) * 2;
		b.vy += ny * k * (ma / (ma + mb)) * 2;
		ram(s, i, j, closing, nx, ny, (a.x + b.x) / 2, (a.y + b.y) / 2, (victim) => spin(s, victim, .8));
	}
}
/** The tree line: put the car back on it, bounce the normal speed, keep 60% of the rest. */
function trees(s, c) {
	const t = s.track;
	const player = c === s.cars[0];
	const loc = t.locate(c.x, c.y);
	const limit = t.width / 2 + t.verge;
	if (Math.abs(loc.d) > limit) {
		const p = t.at(loc.s);
		const side = Math.sign(loc.d);
		const nx = -p.ty * side;
		const ny = p.tx * side;
		c.x = p.x + nx * limit;
		c.y = p.y + ny * limit;
		const vn = c.vx * nx + c.vy * ny;
		if (vn > 0) {
			c.vx -= vn * nx * 1.2;
			c.vy -= vn * ny * 1.2;
		}
		const v = Math.hypot(c.vx, c.vy);
		c.vx *= .6;
		c.vy *= .6;
		c.yaw *= .3;
		c.hit = 1;
		if (v > 6) {
			hurt(s, c, DAMAGE.tree * Math.min(1, v / 20), c.lastHitBy);
			s.fx.push({
				kind: "spark",
				x: c.x,
				y: c.y,
				age: 0
			});
		}
		if (player && v > 3) {
			s.sounds.push("hit");
			s.shake = Math.max(s.shake, Math.min(.5, v / 30));
		}
	}
}
/** One frame of the old model: every car moves, then the pairs, then the trees. */
function advanceOld(s, inputs, dt) {
	for (let i = 0; i < s.cars.length; i++) {
		const c = s.cars[i];
		if (c.wreck > 0) continue;
		moveCar(s, c, inputs[i], dt);
	}
	collide(s);
	for (const c of s.cars) if (c.wreck <= 0) trees(s, c);
}
//#endregion
//#region src/game/content/surfaces.ts
var SURFACES = {
	gravel: {
		grip: 1,
		peak: .13,
		slide: .8,
		drag: 0,
		top: 1
	},
	tarmac: {
		grip: 1.12,
		peak: .1,
		slide: .72,
		drag: 0,
		top: 1
	},
	grass: {
		grip: .55,
		peak: .16,
		slide: .82,
		drag: .08,
		top: .7
	},
	mud: {
		grip: .5,
		peak: .2,
		slide: .85,
		drag: .6,
		top: .6
	},
	water: {
		grip: .6,
		peak: .18,
		slide: .85,
		drag: .45,
		top: .6,
		splash: true
	},
	ice: {
		grip: .22,
		peak: .08,
		slide: .9,
		drag: 0,
		top: 1
	}
};
//#endregion
//#region src/game/physics.ts
/**
* The car model. docs/adr/0003-rigid-body-cars.md has the why.
*
* Each car is a rigid box with a mass and a yaw inertia, on two axles
* (the bicycle model). Each frame is cut into SUB substeps; in each one
* every car moves, then every pair of cars that overlap is pushed apart
* with an impulse at the point they touch, then every car that has put a
* corner into the trees is pushed back the same way. An impulse at a
* corner turns the car as well as slowing it, so a glancing hit slides
* the car along what it hit and a hit behind the axle swings the tail.
*
* A tyre's force rises with its slip angle to a peak and falls smoothly
* to a share of it past the peak (the surface's `slide`): grip lets go
* progressively, into a slide that holds. Past the peak the tyre also
* scrubs: the excess slip drags on the car's speed (SCRUB), so a corner
* taken too fast slows the car until the front bites again. Each axle
* has one budget for driving, braking and cornering (the friction
* circle). Braking moves load to the front. The pedal at speed brakes and locks the rear, which
* then skids and has little left to hold the tail: the handbrake turn.
*
* Each axle reads the surface under it, so a car with two wheels on the
* grass has a front and a rear that grip differently. A car has a height:
* a ramp throws it, in the air it has no grip and no steering, and it
* lands with a bounce that costs it the speed it carried sideways.
*/
/** substeps per frame: 180 Hz, so the tyres stay stable at walking pace and contacts stay shallow */
var SUB = 3;
var G = 9.81;
/** the rear tyres against the front: a touch under 1 so the car rotates at the limit instead of plowing */
var REAR_GRIP = .92;
/** how quickly the drive fades as the rear slides past its peak, per peak */
var TRACTION = 1;
/**
* The safety net under every hand: past COUNTER_FROM peaks of rear slip the wheel is turned into
* the slide by COUNTER of the excess. A pedal slide held at an angle sits under two peaks and is
* left alone; a tail going past that toward a spin is caught, for the thumb as for the bot.
*/
var COUNTER_FROM = 2;
var COUNTER = .8;
/** how far a free wheel follows the front axle's direction of travel, past CASTER_FROM peaks of it */
var CASTER = .8;
var CASTER_FROM = .2;
/** slip, in peaks, past which a sliding tyre bites again */
var GUARD = 1.5;
/** per second: how hard a sliding car's rotation is damped once the tail is well past its peak */
var SPIN_DAMP = 2;
/** how much a far-out tail gains back, at least: above its peak, so a slide always ends */
var GUARD_GAIN = .2;
/** the front tyres keep this much more of their grip past the peak than the surface's slide: a car past the limit rotates rather than plows */
var FRONT_HOLD = .3;
/** centre of gravity height over the wheelbase: how much braking unloads the rear */
var CG_OVER_L = .16;
/** the most load the pitch moves off an axle, as a share of the car's weight */
var SHIFT_MAX = .15;
/** seconds over which the load follows the acceleration: the body's pitch */
var PITCH_LAG = .12;
/** the pedal at speed locks the rear: this share of its side grip is gone while it is held */
var HANDBRAKE = .7;
/** below this the slip-angle formula is fed this speed, so rest is not a singularity */
var V_FLOOR = 3;
/** car against car: how much of the closing speed comes back, and the scrape between the bodies */
var CAR_BOUNCE = .2;
var CAR_FRICTION = .25;
/** in a hit the tyres resist the turn: the yaw inertia a contact sees, over the body's own */
var HIT_INERTIA = 1.5;
/** a car against the trees: the bounce and the scrape. Low friction so a glancing car slides along */
var TREE_BOUNCE = .2;
var TREE_FRICTION = .12;
/** two cars further apart than this in height pass over each other */
var CLEAR_HEIGHT = .9;
/** the bounce: the share of the impact that comes back, and the most it can be, m/s. A landing on a bank's slope would otherwise throw the car into a second jump */
var LAND_REBOUND = .25;
var LAND_REBOUND_MAX = 1.5;
var LAND_HURT = 7;
/** the air and the rolling tyres: a pull on the forward speed, per second */
var DRAG = .12;
/**
* A tyre past its peak scrubs: the slip beyond the peak, in peaks, costs the car this share of
* that axle's grip as a drag along its length, up to SCRUB_MAX peaks of excess. A sliding tyre
* turns the slip into heat and drag, so an over-ambitious corner slows the car until the front
* bites again, instead of the car ploughing on wide at full speed (the owner, 2026-10-06). Better
* tyres carry the same corner with less excess, so they scrub less: the tyre parts are felt
* here as much as in the peak. Every car, rivals included.
*/
var SCRUB = .35;
var SCRUB_MAX = 2;
function setScrub(k) {
	SCRUB = k;
}
var bitten = /* @__PURE__ */ new Map();
/**
* A surface under tyres that bite off the road (CarDef.offroad): grass, mud and water give back
* that share of the grip, the top speed and the drag they take. Gravel, tarmac and ice are as
* they are: a lug does nothing on ice. Memoised, since it is asked three times a substep.
*/
function bite(surface, offroad = 0) {
	const sd = SURFACES[surface];
	if (offroad <= 0 || sd.drag <= 0 && sd.top >= 1) return sd;
	const key = `${surface}:${offroad}`;
	let out = bitten.get(key);
	if (!out) {
		const k = offroad;
		out = {
			...sd,
			grip: sd.grip + (1 - sd.grip) * k,
			top: sd.top + (1 - sd.top) * k,
			drag: sd.drag * (1 - k)
		};
		bitten.set(key, out);
	}
	return out;
}
function advance(s, inputs, dt) {
	const asks = s.cars.map((c, i) => ask(s, c, inputs[i], dt));
	const h = dt / SUB;
	for (const c of s.cars) c.hit = 0;
	for (let k = 0; k < SUB; k++) {
		for (let i = 0; i < s.cars.length; i++) integrate(s, s.cars[i], asks[i], h, k === 2);
		for (let it = 0; it < 2; it++) carContacts(s, it === 0);
		for (const c of s.cars) treeContacts(s, c);
	}
	for (const c of s.cars) {
		if (c.wreck > 0) continue;
		const fwd = c.vx * Math.cos(c.heading) + c.vy * Math.sin(c.heading);
		if (Math.abs(c.slipAngle) > .2 && Math.abs(fwd) > 9 && c.spin <= 0 && !c.air) c.boost = Math.min(1, c.boost + BOOST.perDriftSecond * nitroFill(c.def) * dt);
	}
}
/** The once-a-frame part: the wheel, the nitro, the engine's pace, the countdown of a spin. */
function ask(s, c, input, dt) {
	if (c.wreck > 0) return {
		throttle: 0,
		pedal: 1,
		top: 0,
		pull: 0,
		spinning: false
	};
	const def = c.def;
	const done = c.finishedAt >= 0;
	const want = clamp(input.steer, -1, 1);
	const rate = 9 * dt;
	c.steer += clamp(want - c.steer, -rate, rate);
	const pace = (1 - DAMAGE_PACE * (c.damage / 100)) * enginePace(s, c);
	if (c.spin > 0) c.spin -= dt;
	if (c.slick > 0) c.slick -= dt;
	const spinning = c.spin > 0;
	if (input.boost && !done && !spinning && c.boost > .05 && c.boosting <= 0) {
		const tank = nitroTank(def);
		c.boosting = Math.min(tank * BOOST.burst, c.boost * tank);
		if (c === s.cars[0]) s.sounds.push("nitro");
	}
	const boosting = c.boosting > 0;
	if (boosting) {
		c.boosting -= dt;
		c.boost = Math.max(0, c.boost - dt / nitroTank(def));
	}
	return {
		throttle: done || spinning ? 0 : clamp(input.throttle, 0, 1),
		pedal: done ? 1 : spinning ? 0 : clamp(input.brake, 0, 1),
		top: def.topSpeed * pace * (boosting ? BOOST.top : 1),
		pull: def.accel * pace * (boosting ? BOOST.accel : 1),
		spinning
	};
}
/**
* The tyre's lateral force as a share of its grip, for a slip of x peaks:
* up to 1 at x = 1, then down smoothly to `slide`. On the rear, past
* `guard` peaks it climbs back toward 1: a tail far out bites again,
* which is what holds a slide at an angle instead of letting it become
* a spin (the arcade spin guard).
*/
function tyre(x, slide, guard) {
	const a = Math.abs(x);
	let f = a <= 1 ? 2 * a / (1 + a * a) : slide + (1 - slide) / (1 + .6 * (a - 1) * (a - 1));
	if (a > guard) f += Math.max(1 - slide, GUARD_GAIN) * Math.min(1, (a - guard) / guard);
	return Math.sign(x) * f;
}
/** One axle's force in its own frame (x along the wheel), capped together by the friction circle. */
function axle(demandX, alpha, surf, cap, vAxleY, h, guard = Infinity) {
	let fy = -cap * tyre(alpha / surf.peak, surf.slide, guard);
	const stop = Math.abs(vAxleY) / h;
	if (Math.abs(fy) > stop) fy = Math.sign(fy) * stop;
	let fx = demandX;
	const total = Math.hypot(fx, fy);
	if (total > cap) {
		fx *= cap / total;
		fy *= cap / total;
	}
	return [fx, fy];
}
function integrate(s, c, a, h, last) {
	const def = c.def;
	const t = s.track;
	const loc = t.locate(c.x, c.y);
	const road = t.at(loc.s);
	const fx = Math.cos(c.heading);
	const fy = Math.sin(c.heading);
	let vx = c.vx * fx + c.vy * fy;
	let vy = c.vx * -fy + c.vy * fx;
	let w = c.yaw;
	const L = wheelbase(def);
	const b = L * .5;
	const cc = L - b;
	const k2 = inertia(def);
	const along = fx * road.tx + fy * road.ty;
	const across = fx * -road.ty + fy * road.tx;
	const sf = bite(t.surfaceAt(loc.s + b * along, loc.d + b * across, c.x + fx * b, c.y + fy * b), def.offroad);
	const sr = bite(t.surfaceAt(loc.s - cc * along, loc.d - cc * across, c.x - fx * cc, c.y - fy * cc), def.offroad);
	const here = t.surfaceAt(loc.s, loc.d, c.x, c.y);
	const sc = bite(here, def.offroad);
	const ground = t.groundAt(loc.s, loc.d);
	const vAlong = c.vx * road.tx + c.vy * road.ty;
	const vzGround = (t.groundAt(loc.s + vAlong * h, loc.d) - ground) / h;
	if (!c.air) {
		if (vzGround < c.vz - G * h * 2 && c.vz > .5) {
			c.air = true;
			c.z = ground;
		} else {
			c.z = ground;
			c.vz = vzGround;
		}
	}
	if (c.air) {
		c.vz -= G * h;
		c.z += c.vz * h;
		if (c.z <= ground && c.vz < vzGround) land(s, c, vx, vy, ground, vzGround, sc.splash === true);
		vx = c.vx * fx + c.vy * fy;
		vy = c.vx * -fy + c.vy * fx;
	}
	let ax = 0;
	let ay = 0;
	let wdot = 0;
	if (!c.air) {
		const loose = a.spinning ? 1 - .65 * clamp(c.spin / 1, 0, 1) : 1;
		const shift = clamp(CG_OVER_L * (c.ax < 0 ? c.ax : c.ax * .5) / G, -.15, SHIFT_MAX);
		const oiled = c.slick > 0;
		const capF = def.grip * sf.grip * (.5 - shift) * loose * (oiled ? OIL.grip : 1);
		const capR = def.grip * sr.grip * REAR_GRIP * (.5 + shift) * loose * (oiled ? OIL.rearGrip : 1);
		const top = a.top * Math.min(sf.top, sr.top);
		const front = def.frontDrive ?? 0;
		let drive = 0;
		if (a.throttle > 0 && vx < top) drive = a.pull * a.throttle * Math.max(0, 1 - vx / top);
		let brakeF = 0;
		let brakeR = 0;
		let handbrake = false;
		if (a.pedal > 0) {
			if (vx > .4) {
				brakeF = def.brake * a.pedal * .75;
				brakeR = def.brake * a.pedal * .25;
				if (vx > 6) {
					handbrake = true;
					brakeR = capR * .5 * a.pedal;
				}
			} else if (vx > -5) drive = -def.accel * .5 * a.pedal;
		} else if (vx < 0) brakeF = brakeR = def.brake * .25;
		c.handbrake = handbrake;
		const roll = clamp(Math.abs(vx) / .5, 0, 1) * Math.sign(vx);
		const vxs = Math.max(Math.abs(vx), V_FLOOR);
		const vyF = vy + w * b;
		const lock = steeringLock(def, vx);
		const free = (1 - Math.abs(c.steer)) * CASTER;
		const swing = steeringLock(def, 0);
		const vyR = vy - w * cc;
		const alphaR = Math.atan2(vyR, vxs);
		const asked = Math.atan(c.steer * yawMax(def, vx) * L / vxs);
		const past = Math.abs(alphaR) - sr.peak * COUNTER_FROM;
		const tailOut = past > 0 && Math.abs(vx) > 6 ? Math.sign(alphaR) * past * COUNTER : 0;
		const travelF = Math.atan2(vyF, vxs);
		const caster = Math.sign(travelF) * Math.max(0, Math.abs(travelF) - sf.peak * CASTER_FROM);
		const delta = clamp(asked + tailOut, -lock, lock) + free * clamp(caster, -swing, swing) * Math.sign(vx || 1);
		const alphaF = Math.atan2(vyF, vxs) - delta * Math.sign(vx || 1);
		if (drive > 0) drive *= clamp(1 - (Math.abs(alphaR) / sr.peak - 1) * TRACTION, .25, 1);
		const demandF = drive * front - brakeF * roll;
		const demandR = drive * (1 - front) - brakeR * roll;
		const vyWheel = vyF * Math.cos(delta) - vx * Math.sin(delta);
		const [fxF, fyF] = axle(demandF, alphaF, {
			...sf,
			slide: sf.slide + (1 - sf.slide) * FRONT_HOLD
		}, capF, vyWheel, h * 2);
		const [fxR, fyR] = axle(demandR, alphaR, sr, handbrake ? capR * (1 - HANDBRAKE * a.pedal) : capR, vyR, h * 2, GUARD);
		if (last) {
			c.sliding = (Math.abs(alphaR) > sr.peak * 1.3 || Math.abs(alphaF) > sf.peak * 1.3) && Math.abs(vx) > 2;
			c.slipF = alphaF / sf.peak;
			c.slipR = alphaR / sr.peak;
		}
		const cd = Math.cos(delta);
		const sd = Math.sin(delta);
		const carFx = fxF * cd - fyF * sd;
		const carFy = fxF * sd + fyF * cd;
		const scrub = SCRUB * (capF * clamp(Math.abs(alphaF) / sf.peak - 1, 0, SCRUB_MAX) + capR * clamp(Math.abs(alphaR) / sr.peak - 1, 0, SCRUB_MAX));
		ax = carFx + fxR - vx * DRAG - scrub * roll;
		ay = carFy + fyR;
		if (vx > top) ax -= (vx - top) * 2;
		wdot = (carFy * b - fyR * cc) / k2;
		wdot -= w * SPIN_DAMP * clamp((Math.abs(alphaR) / sr.peak - 1) / 3, 0, 1);
		c.ax += (fxR + carFx - c.ax) * Math.min(1, h / PITCH_LAG);
		const rolling = clamp(Math.abs(vx) / 4, 0, 1);
		const slidingSide = clamp(Math.abs(vy) / 2, 0, 1);
		const blend = Math.max(rolling, slidingSide);
		w += wdot * h;
		const wKin = vx * Math.tan(delta) / L;
		w = wKin + (w - wKin) * blend;
	} else {
		c.handbrake = false;
		c.sliding = false;
		c.slipF = c.slipR = 0;
		w *= 1 - .3 * h;
	}
	const drag = c.air ? .02 : sc.drag;
	ax -= vx * drag;
	ay -= vy * drag;
	vx += (ax + vy * w) * h;
	vy += (ay - vx * w) * h;
	c.yaw = w;
	c.heading += w * h;
	const nfx = Math.cos(c.heading);
	const nfy = Math.sin(c.heading);
	c.vx = vx * nfx + vy * -nfy;
	c.vy = vx * nfy + vy * nfx;
	c.x += c.vx * h;
	c.y += c.vy * h;
	if (last) {
		c.onRoad = Math.abs(loc.d) <= t.width / 2;
		c.surface = here;
		c.slipAngle = Math.abs(vx) > 1 ? Math.atan2(vy, Math.abs(vx)) : 0;
		const v = Math.hypot(vx, vy);
		if (sc.splash && !c.air && v > 4 && s.time * 20 - Math.floor(s.time * 20) < .34) {
			s.fx.push({
				kind: "splash",
				x: c.x - nfx * def.length * .4,
				y: c.y - nfy * def.length * .4,
				age: 0
			});
			if (c === s.cars[0] && v > 8 && Math.random() < .15) s.sounds.push("splash");
		}
	}
}
/** Touching down: the tyres take the sideways speed the car came down with, and a hard landing bounces, but not in water. */
function land(s, c, vx, vy, ground, vzGround, wet) {
	const impact = c.vz - vzGround;
	const fx = Math.cos(c.heading);
	const fy = Math.sin(c.heading);
	const crooked = Math.abs(vy) / (Math.hypot(vx, vy) || 1);
	vx *= .96 - .25 * crooked;
	vy *= .35;
	c.yaw *= .5;
	c.vx = vx * fx + vy * -fy;
	c.vy = vx * fy + vy * fx;
	c.z = ground;
	if (wet) {
		for (let k = 0; k < 4; k++) s.fx.push({
			kind: "splash",
			x: c.x + Math.cos(c.heading + k * 1.6) * 1.2,
			y: c.y + Math.sin(c.heading + k * 1.6) * 1.2,
			age: 0
		});
		if (c === s.cars[0]) s.sounds.push("splash");
	}
	if (impact < -2.5 && vzGround < .5 && !wet) {
		c.vz = vzGround + Math.min(LAND_REBOUND_MAX, -impact * LAND_REBOUND);
		c.z = ground + .01;
	} else {
		c.vz = vzGround;
		c.air = false;
	}
	if (impact < -7) hurt(s, c, DAMAGE.tree * Math.min(1, (-impact - LAND_HURT) / 6), c.lastHitBy);
	if (c === s.cars[0] && impact < -2) {
		s.sounds.push("land");
		s.shake = Math.max(s.shake, Math.min(.5, -impact / 18));
	}
}
/** yaw inertia over mass, m²: a box, a little under, for turn-in */
function inertia(def) {
	return (def.length * def.length + def.width * def.width) / 12 * 1;
}
/** the four corners of the car's body, front right first */
function corners(c) {
	const fx = Math.cos(c.heading);
	const fy = Math.sin(c.heading);
	const hl = c.def.length / 2;
	const hw = c.def.width / 2;
	return [
		[c.x + fx * hl - fy * hw, c.y + fy * hl + fx * hw],
		[c.x + fx * hl + fy * hw, c.y + fy * hl - fx * hw],
		[c.x - fx * hl + fy * hw, c.y - fy * hl - fx * hw],
		[c.x - fx * hl - fy * hw, c.y - fy * hl + fx * hw]
	];
}
/**
* Where two boxes overlap, by separating axes: the normal from a to b,
* the depth, and the point of contact (the deepest corner, or the middle
* of the two deepest when a face lies flat on a face). Null when apart.
*/
function overlap(a, b) {
	const A = corners(a);
	const B = corners(b);
	let depth = Infinity;
	let nx = 0;
	let ny = 0;
	let fromA = true;
	for (const [car, isA] of [[a, true], [b, false]]) for (const [ux, uy] of [[Math.cos(car.heading), Math.sin(car.heading)], [-Math.sin(car.heading), Math.cos(car.heading)]]) {
		let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
		for (const p of A) {
			const d = p[0] * ux + p[1] * uy;
			if (d < minA) minA = d;
			if (d > maxA) maxA = d;
		}
		for (const p of B) {
			const d = p[0] * ux + p[1] * uy;
			if (d < minB) minB = d;
			if (d > maxB) maxB = d;
		}
		const o = Math.min(maxA - minB, maxB - minA);
		if (o <= 0) return null;
		if (o < depth) {
			depth = o;
			const sgn = (b.x - a.x) * ux + (b.y - a.y) * uy >= 0 ? 1 : -1;
			nx = ux * sgn;
			ny = uy * sgn;
			fromA = isA;
		}
	}
	const pts = fromA ? B : A;
	const sgn = fromA ? -1 : 1;
	let best = -Infinity;
	for (const p of pts) best = Math.max(best, sgn * (p[0] * nx + p[1] * ny));
	let px = 0;
	let py = 0;
	let n = 0;
	for (const p of pts) if (sgn * (p[0] * nx + p[1] * ny) > best - .08) {
		px += p[0];
		py += p[1];
		n++;
	}
	return {
		nx,
		ny,
		depth,
		px: px / n,
		py: py / n
	};
}
/**
* An impulse between two bodies at a point, along n (from a to b), with
* restitution and Coulomb friction. b may be the world (mass Infinity).
* Returns the closing speed at the point before the impulse.
*/
function impulse(a, b, px, py, nx, ny, bounce, friction) {
	const ma = a.def.mass;
	const ia = ma * inertia(a.def) * HIT_INERTIA;
	const rax = px - a.x;
	const ray = py - a.y;
	let vrx = -(a.vx - a.yaw * ray);
	let vry = -(a.vy + a.yaw * rax);
	let inv = 1 / ma + (rax * ny - ray * nx) ** 2 / ia;
	let mb = Infinity;
	let ib = Infinity;
	let rbx = 0;
	let rby = 0;
	if (b) {
		mb = b.def.mass;
		ib = mb * inertia(b.def) * HIT_INERTIA;
		rbx = px - b.x;
		rby = py - b.y;
		vrx += b.vx - b.yaw * rby;
		vry += b.vy + b.yaw * rbx;
		inv += 1 / mb + (rbx * ny - rby * nx) ** 2 / ib;
	}
	const vn = vrx * nx + vry * ny;
	if (vn >= 0) return 0;
	const j = -(1 + bounce) * vn / inv;
	let tx = vrx - vn * nx;
	let ty = vry - vn * ny;
	const vt = Math.hypot(tx, ty);
	let jt = 0;
	if (vt > 1e-6) {
		tx /= vt;
		ty /= vt;
		let invT = 1 / ma + (rax * ty - ray * tx) ** 2 / ia;
		if (b) invT += 1 / mb + (rbx * ty - rby * tx) ** 2 / ib;
		jt = Math.min(vt / invT, friction * j);
	}
	const jx = j * nx - jt * tx;
	const jy = j * ny - jt * ty;
	a.vx -= jx / ma;
	a.vy -= jy / ma;
	a.yaw -= (rax * jy - ray * jx) / ia;
	if (b) {
		b.vx += jx / mb;
		b.vy += jy / mb;
		b.yaw += (rbx * jy - rby * jx) / ib;
	}
	return -vn;
}
/** Every pair of cars that overlap: push them apart by mass and trade an impulse at the contact. */
function carContacts(s, report) {
	const cars = s.cars;
	for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
		const a = cars[i];
		const b = cars[j];
		if (a.wreck > 0 || b.wreck > 0) continue;
		if (Math.abs(a.z - b.z) > CLEAR_HEIGHT) continue;
		const far = (a.def.length + b.def.length) / 2 + .5;
		if (Math.abs(b.x - a.x) > far || Math.abs(b.y - a.y) > far) continue;
		const o = overlap(a, b);
		if (!o) continue;
		const closing = (a.vx - b.vx) * o.nx + (a.vy - b.vy) * o.ny;
		const ia = 1 / a.def.mass;
		const ib = 1 / b.def.mass;
		const push = Math.max(0, o.depth - .01) * .8;
		a.x -= o.nx * push * (ia / (ia + ib));
		a.y -= o.ny * push * (ia / (ia + ib));
		b.x += o.nx * push * (ib / (ia + ib));
		b.y += o.ny * push * (ib / (ia + ib));
		const hit = impulse(a, b, o.px, o.py, o.nx, o.ny, CAR_BOUNCE, CAR_FRICTION);
		if (report && hit > 0) ram(s, i, j, Math.max(0, closing), o.nx, o.ny, o.px, o.py, (victim) => victim.spin = Math.max(victim.spin, .6));
		else a.hit = b.hit = 1;
	}
}
/**
* A car that has put a corner into the trees is pushed back out with an
* impulse at that corner. The trees are everything outside the road and
* its verge, and outside every shortcut lane: a corner is in them when it
* is beyond both, and is pushed back toward whichever it is nearer.
*/
function treeContacts(s, c) {
	const t = s.track;
	const loc = t.locate(c.x, c.y);
	const limit = t.width / 2 + t.verge;
	if (Math.abs(loc.d) < limit - c.def.length) return;
	const road = t.at(loc.s);
	const rx = -road.ty;
	const ry = road.tx;
	let deepest = 0;
	let cx = 0;
	let cy = 0;
	let nx = 0;
	let ny = 0;
	for (const p of corners(c)) {
		const d = loc.d + (p[0] - c.x) * rx + (p[1] - c.y) * ry;
		let pen = Math.abs(d) - limit;
		let px = -rx * Math.sign(d);
		let py = -ry * Math.sign(d);
		if (pen > 0 && t.lanes.length) {
			const l = t.laneAt(p[0], p[1]);
			if (l && l.dist - (l.lane.width / 2 + 2) < pen) {
				pen = l.dist - (l.lane.width / 2 + 2);
				const len = l.dist || 1;
				px = (l.px - p[0]) / len;
				py = (l.py - p[1]) / len;
			}
		}
		if (pen > deepest) {
			deepest = pen;
			cx = p[0];
			cy = p[1];
			nx = px;
			ny = py;
		}
	}
	if (deepest <= 0) return;
	c.x += nx * deepest;
	c.y += ny * deepest;
	const hit = impulse(c, null, cx, cy, -nx, -ny, TREE_BOUNCE, TREE_FRICTION);
	c.hit = 1;
	if (hit > 3) {
		hurt(s, c, DAMAGE.tree * Math.min(1, hit / 12), c.lastHitBy);
		s.fx.push({
			kind: "spark",
			x: cx,
			y: cy,
			age: 0
		});
	}
	if (c === s.cars[0] && hit > 2) {
		s.sounds.push("hit");
		s.shake = Math.max(s.shake, Math.min(.5, hit / 20));
	}
}
//#endregion
//#region src/game/sim.ts
var DT = 1 / 60;
/** steering lock at rest, radians per unit of turnRate, and the speed that halves it: 50 until the
* cars got a fifth faster (2026-10-04), raised with them so a car still turns at its new speeds */
var LOCK = .17;
var LOCK_FADE = 60;
/** how much more yaw than the grip can hold a hand may ask for at speed: room to provoke a slide */
var YAW_ROOM = 1.35;
/**
* One fixed step. The car model moves the cars (physics.ts: the tyres,
* the contacts between cars and with the trees, height; physics-old.ts
* at ?physics=old). Around it the race runs: the countdown, a tap of
* nitro from a tank that drifting, ramming and wrecking fill, guns that
* fire themselves, bullets, missiles, mines, oil slicks and pickups,
* and the laps.
* At 100 damage a car is a wreck for a few seconds, then it is back on
* the centreline.
*/
function step(s, inputs, dt) {
	s.time += dt;
	if (s.hold > 0) {
		s.hold -= dt;
		if (s.hold <= 0) {
			s.sounds.push("go");
			for (const c of s.cars) c.lapStart = s.time;
		}
		return;
	}
	if (s.hold > -(GUN.holdOff + 1)) s.hold -= dt;
	for (const c of s.cars) for (let k = 0; k < c.grudge.length; k++) if (c.grudge[k] > 0) c.grudge[k] = Math.max(0, c.grudge[k] - GRUDGE.decay * dt);
	const held = s.cars.map((c, i) => rescue(s, c, inputs[i] ?? {
		steer: 0,
		throttle: 0,
		brake: 1,
		boost: false
	}, dt));
	if (s.physics === "old") advanceOld(s, held, dt);
	else advance(s, held, dt);
	for (let i = 0; i < s.cars.length; i++) {
		const c = s.cars[i];
		if (c.wreck > 0) burn(s, c, dt);
		else guns(s, c, i, dt);
	}
	for (const c of s.cars) if (c.wreck <= 0) settle(s, c, c === s.cars[0]);
	flyBullets(s, dt);
	flyMissiles(s, dt);
	mines(s, dt);
	oils(s, dt);
	pickups(s, dt);
	for (const c of s.cars) if (c.damage >= 100 && c.wreck <= 0) wreck(s, c);
	for (let i = s.fx.length - 1; i >= 0; i--) {
		s.fx[i].age += dt;
		if (s.fx[i].age > 1) s.fx.splice(i, 1);
	}
	for (let i = s.toasts.length - 1; i >= 0; i--) {
		s.toasts[i].age += dt;
		if (s.toasts[i].age > 2.6) s.toasts.splice(i, 1);
	}
	s.shake = Math.max(0, s.shake - dt * 2.5);
}
/** Target, machine gun, missile lock, mine drop, oil leak: all automatic. */
function guns(s, c, i, dt) {
	const g = c.def.gun;
	if (c.missileWait > 0) c.missileWait -= dt;
	if (c.mineWait > 0) c.mineWait -= dt;
	if (c.oilWait > 0) c.oilWait -= dt;
	let target = -1;
	let targetD = GUN.range;
	let best = Infinity;
	const leader = leaderOf(s);
	for (let k = 0; k < s.cars.length; k++) {
		if (k === i) continue;
		const o = s.cars[k];
		if (o.wreck > 0) continue;
		const dx = o.x - c.x;
		const dy = o.y - c.y;
		const d = Math.hypot(dx, dy);
		if (d >= GUN.range) continue;
		const a = wrap(Math.atan2(dy, dx) - c.heading);
		const score = d / (1 + GRUDGE.aim * hostility(s, c, k, leader));
		if (Math.abs(a) < GUN.cone && score < best) {
			target = k;
			targetD = d;
			best = score;
		}
	}
	c.lockTime = target >= 0 && target === c.target ? c.lockTime + dt : 0;
	c.target = target;
	const canFire = c.finishedAt < 0 && c.spin <= 0 && s.hold < -GUN.holdOff;
	if (canFire && g > 0 && target >= 0 && !c.overheated) {
		c.heat += dt / GUN.heat;
		if (c.heat >= 1) c.overheated = true;
		const rate = GUN.rate * (1 + .25 * (g - 1));
		c.gunWait -= dt;
		if (c.gunWait <= 0) {
			c.gunWait += 1 / rate;
			const spread = (Math.sin(s.time * 97 + i * 13) * .5 + Math.sin(s.time * 41) * .5) * .06 * (1 + GUN.spray * (1 - c.driver.skill));
			const h = c.heading + spread;
			const nose = c.def.length * .55;
			const v = 70 + Math.max(0, c.speed);
			s.bullets.push({
				x: c.x + Math.cos(h) * nose,
				y: c.y + Math.sin(h) * nose,
				vx: Math.cos(h) * v,
				vy: Math.sin(h) * v,
				age: 0,
				owner: i
			});
			c.shots++;
			if (i === 0 && c.shots % 2 === 0) s.sounds.push("gun");
		}
	} else {
		c.heat = Math.max(0, c.heat - dt / GUN.cool);
		if (c.overheated && c.heat < .15) c.overheated = false;
	}
	if (canFire && target >= 0 && c.missiles > 0 && c.missileWait <= 0 && c.lockTime >= MISSILE.lock && targetD < MISSILE.range) {
		c.missiles--;
		c.missileWait = MISSILE.every;
		const nose = c.def.length * .6;
		s.missiles.push({
			x: c.x + Math.cos(c.heading) * nose,
			y: c.y + Math.sin(c.heading) * nose,
			heading: c.heading,
			speed: Math.max(0, c.speed) + MISSILE.speed,
			age: 0,
			owner: i,
			target
		});
		s.sounds.push(i === 0 ? "missile" : "missile-far");
	}
	const behind = (reach) => {
		for (let k = 0; k < s.cars.length; k++) {
			if (k === i) continue;
			const o = s.cars[k];
			if (o.wreck > 0) continue;
			let gap = o.s - c.s;
			if (gap < -s.track.length / 2) gap += s.track.length;
			if (gap > s.track.length / 2) gap -= s.track.length;
			if (gap < -3 && gap > -reach && Math.abs(o.d - c.d) < 2.6) return true;
		}
		return false;
	};
	const tail = -c.def.length * .7;
	const mineBehind = behind(MINE.behind);
	const oilBehind = behind(OIL.behind);
	c.tailed = mineBehind || oilBehind ? c.tailed + dt : 0;
	const ready = c.tailed >= 10 * (1 - c.driver.skill);
	if (canFire && ready && c.mines > 0 && c.mineWait <= 0 && Math.abs(c.speed) > 5 && mineBehind) {
		c.mines--;
		c.mineWait = MINE.every;
		s.mines.push({
			x: c.x + Math.cos(c.heading) * tail,
			y: c.y + Math.sin(c.heading) * tail,
			age: 0,
			owner: i
		});
		if (i === 0) s.sounds.push("mine");
	}
	if (canFire && ready && c.oil > 0 && c.oilWait <= 0 && Math.abs(c.speed) > 5 && oilBehind) {
		c.oil--;
		c.oilWait = OIL.every;
		s.oils.push({
			x: c.x + Math.cos(c.heading) * tail,
			y: c.y + Math.sin(c.heading) * tail,
			age: 0,
			owner: i
		});
		if (i === 0) s.sounds.push("oil");
	}
}
function flyBullets(s, dt) {
	const t = s.track;
	for (let i = s.bullets.length - 1; i >= 0; i--) {
		const b = s.bullets[i];
		b.age += dt;
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		let gone = b.age > .75;
		if (!gone) {
			const loc = t.locate(b.x, b.y);
			if (Math.abs(loc.d) > t.width / 2 + t.verge) {
				gone = true;
				s.fx.push({
					kind: "puff",
					x: b.x,
					y: b.y,
					age: .5
				});
			}
		}
		for (let k = 0; k < s.cars.length && !gone; k++) {
			if (k === b.owner) continue;
			const c = s.cars[k];
			if (c.wreck > 0) continue;
			if (Math.hypot(c.x - b.x, c.y - b.y) < 1.7) {
				gone = true;
				const shooter = s.cars[b.owner];
				hurt(s, c, DAMAGE.bullet * (1 + .3 * (shooter.def.gun - 1)), b.owner);
				anger(s, c, b.owner, GRUDGE.bullet);
				s.fx.push({
					kind: "spark",
					x: b.x,
					y: b.y,
					age: 0
				});
				if (k === 0) s.shake = Math.max(s.shake, .15);
			}
		}
		if (gone) s.bullets.splice(i, 1);
	}
}
/** A missile bends toward its target and goes off on a car or a tree. */
function flyMissiles(s, dt) {
	const t = s.track;
	for (let i = s.missiles.length - 1; i >= 0; i--) {
		const m = s.missiles[i];
		m.age += dt;
		const tc = m.target >= 0 ? s.cars[m.target] : null;
		if (tc && tc.wreck <= 0) {
			const a = wrap(Math.atan2(tc.y - m.y, tc.x - m.x) - m.heading);
			m.heading += clamp(a, -MISSILE.turn * dt, MISSILE.turn * dt);
		}
		m.x += Math.cos(m.heading) * m.speed * dt;
		m.y += Math.sin(m.heading) * m.speed * dt;
		let gone = m.age > MISSILE.life;
		const loc = t.locate(m.x, m.y);
		if (Math.abs(loc.d) > t.width / 2 + t.verge) {
			gone = true;
			s.fx.push({
				kind: "puff",
				x: m.x,
				y: m.y,
				age: 0
			});
		}
		for (let k = 0; k < s.cars.length && !gone; k++) {
			if (k === m.owner) continue;
			const c = s.cars[k];
			if (c.wreck > 0) continue;
			if (Math.hypot(c.x - m.x, c.y - m.y) < 2.2) {
				gone = true;
				hurt(s, c, DAMAGE.missile, m.owner);
				anger(s, c, m.owner, GRUDGE.blast);
				spin(s, c, .5);
				c.vx += Math.cos(m.heading) * 4;
				c.vy += Math.sin(m.heading) * 4;
				boom(s, c.x, c.y, k === 0 ? .7 : .3);
			}
		}
		if (gone) s.missiles.splice(i, 1);
	}
}
function mines(s, dt) {
	for (let i = s.mines.length - 1; i >= 0; i--) {
		const m = s.mines[i];
		m.age += dt;
		let gone = m.age > MINE.life;
		for (let k = 0; k < s.cars.length && !gone; k++) {
			const c = s.cars[k];
			if (c.wreck > 0 || k === m.owner && m.age < 1.5) continue;
			if (Math.hypot(c.x - m.x, c.y - m.y) < MINE.r + .9) {
				gone = true;
				hurt(s, c, DAMAGE.mine, m.owner);
				anger(s, c, m.owner, GRUDGE.blast);
				spin(s, c, .6);
				boom(s, m.x, m.y, k === 0 ? .7 : .3);
			}
		}
		if (gone) s.mines.splice(i, 1);
	}
}
/**
* Oil on the road: a car that crosses a slick keeps little grip for a
* moment (physics.ts reads `slick`). The slick stays; the one who laid it
* is spared it for a moment. A car that goes sideways on it has been spun,
* and the one who laid the oil is paid, as a ram that spins someone is.
*/
function oils(s, dt) {
	for (let i = s.oils.length - 1; i >= 0; i--) {
		const o = s.oils[i];
		o.age += dt;
		if (o.age > OIL.life) {
			s.oils.splice(i, 1);
			continue;
		}
		for (let k = 0; k < s.cars.length; k++) {
			const c = s.cars[k];
			if (c.wreck > 0 || c.air || k === o.owner && o.age < 1.5) continue;
			if (Math.hypot(c.x - o.x, c.y - o.y) < OIL.r + .6) {
				if (c.slick <= 0) {
					c.slickPaid = false;
					const lean = Math.abs(c.slipAngle) > .02 ? Math.sign(c.slipAngle) : Math.sin(s.time * 13 + c.x) >= 0 ? 1 : -1;
					c.yaw += lean * OIL.kick * Math.min(1, Math.abs(c.speed) / 15);
					if (k === 0) {
						s.sounds.push("slick");
						s.shake = Math.max(s.shake, .2);
					}
				}
				c.slick = OIL.slick;
				if (k !== o.owner) c.slickBy = o.owner;
			}
		}
	}
	for (let k = 0; k < s.cars.length; k++) {
		const c = s.cars[k];
		if (c.slick <= 0 || c.slickPaid || c.slickBy < 0 || c.wreck > 0) continue;
		if (Math.abs(c.slipAngle) > .45 && Math.abs(c.speed) > 5) {
			c.slickPaid = true;
			const by = s.cars[c.slickBy];
			anger(s, c, c.slickBy, GRUDGE.spin);
			const credit = 40 * (CLASS_RANK[c.def.cls] + 1);
			by.ramCash += credit;
			if (by === s.cars[0]) s.toasts.push({
				text: {
					fi: `${c.driver.name.fi} liukastui! +${credit} cr`,
					en: `${c.driver.name.en} slid! +${credit} cr`
				},
				colour: "#ffd870",
				age: 0
			});
			else if (c === s.cars[0]) s.toasts.push({
				text: {
					fi: `${by.driver.name.fi} öljysi sinut`,
					en: `${by.driver.name.en} oiled you`
				},
				colour: "#ff8a3a",
				age: 0
			});
		}
	}
}
function pickups(s, dt) {
	for (const p of s.pickups) {
		if (p.gone > 0) {
			p.gone -= dt;
			continue;
		}
		for (let k = 0; k < s.cars.length; k++) {
			const c = s.cars[k];
			if (c.wreck > 0 || Math.hypot(c.x - p.x, c.y - p.y) > 1.5) continue;
			const def = PICKUPS[p.kind];
			p.gone = 9;
			switch (p.kind) {
				case "cash":
					c.cash += def.amount;
					break;
				case "nitro":
					c.boost = Math.min(1, c.boost + def.amount);
					break;
				case "wrench":
					c.damage = Math.max(0, c.damage - def.amount);
					break;
				case "missile":
					c.missiles = Math.min(9, c.missiles + 1);
					break;
				case "mine":
					c.mines = Math.min(9, c.mines + 1);
					break;
				case "oil": c.oil = Math.min(9, c.oil + 1);
			}
			s.fx.push({
				kind: p.kind === "cash" ? "cash" : "flash",
				x: p.x,
				y: p.y,
				age: 0,
				colour: def.colour
			});
			if (k === 0) {
				s.sounds.push(p.kind === "cash" ? "cash" : "pickup");
				s.toasts.push({
					text: p.kind === "cash" ? {
						fi: `+${def.amount} cr`,
						en: `+${def.amount} cr`
					} : def.name,
					colour: def.colour,
					age: 0
				});
			}
			break;
		}
	}
}
/** The car is a wreck: it stops and burns, the one who did it is paid. */
function wreck(s, c) {
	c.wreck = 3;
	c.wrecked++;
	if (s.physics === "old") c.vx = c.vy = c.yaw = 0;
	c.spin = 0;
	c.boosting = 0;
	boom(s, c.x, c.y, c === s.cars[0] ? 1 : .5);
	s.sounds.push("wreck");
	const by = c.lastHitBy >= 0 ? s.cars[c.lastHitBy] : null;
	if (by) {
		anger(s, c, c.lastHitBy, GRUDGE.wreck);
		by.wrecks++;
		by.boost = Math.min(1, by.boost + BOOST.perWreck * nitroFill(by.def));
		const bounty = 200 * (CLASS_RANK[c.def.cls] + 1);
		by.bounty += bounty;
		if (by === s.cars[0]) s.toasts.push({
			text: {
				fi: `${c.driver.name.fi} romuna! +${bounty} cr`,
				en: `${c.driver.name.en} wrecked! +${bounty} cr`
			},
			colour: "#ff8a3a",
			age: 0
		});
		else if (c === s.cars[0]) s.toasts.push({
			text: {
				fi: `${by.driver.name.fi} romutti sinut`,
				en: `${by.driver.name.en} wrecked you`
			},
			colour: "#ff4a3a",
			age: 0
		});
	} else if (c === s.cars[0]) s.toasts.push({
		text: {
			fi: "Romuna",
			en: "Wrecked"
		},
		colour: "#ff4a3a",
		age: 0
	});
	c.lastHitBy = -1;
}
/** Burning: count down, then back on the centreline, patched up halfway. */
function burn(s, c, dt) {
	c.wreck -= dt;
	if (c.wreck > 0) return;
	c.damage = 55;
	onRoad(s, c);
}
/** Back on the centreline a little ahead, standing, the clocks reset: after a wreck, or a tow without the flash. */
function onRoad(s, c, flash = true) {
	const p = s.track.at(c.s + 3);
	c.x = p.x;
	c.y = p.y;
	c.heading = Math.atan2(p.ty, p.tx);
	c.vx = c.vy = c.yaw = 0;
	c.z = c.vz = 0;
	c.air = false;
	c.d = 0;
	c.stall = 0;
	c.stallX = c.x;
	c.stallY = c.y;
	c.slick = 0;
	c.stuck = 0;
	c.stuckS = c.s;
	c.backOut = 0;
	if (!flash) return;
	s.fx.push({
		kind: "flash",
		x: c.x,
		y: c.y,
		age: 0,
		colour: "#fff"
	});
	if (c === s.cars[0]) s.sounds.push("respawn");
}
/** The lap counter and the derived numbers, after everything has moved. */
function settle(s, c, player) {
	const t = s.track;
	const loc = t.locate(c.x, c.y);
	const prevS = c.s;
	c.s = loc.s;
	c.d = loc.d;
	const fx = Math.cos(c.heading);
	const fy = Math.sin(c.heading);
	c.speed = c.vx * fx + c.vy * fy;
	c.slip = c.vx * -fy + c.vy * fx;
	const L = t.length;
	if (c.s > L * .4 && c.s < L * .6) c.half = true;
	if (prevS > L * .8 && c.s < L * .2 && c.half && c.finishedAt < 0) {
		c.laps.push(s.time - c.lapStart);
		c.lapStart = s.time;
		c.half = false;
		if (c.laps.length >= s.totalLaps) {
			c.finishedAt = s.time;
			if (player) {
				s.finished = true;
				s.sounds.push("finish");
			}
		} else {
			c.lap++;
			if (player) s.sounds.push("lap");
		}
	}
	const lapS = c.lap === 1 && !c.half && c.s > L * .8 ? c.s - L : c.s;
	c.progress = c.finishedAt >= 0 ? s.totalLaps * L + 1e6 - c.finishedAt : (c.lap - 1) * L + lapS;
	const slow = Math.hypot(c.vx, c.vy) < 1.5;
	if (s.hold <= 0 && c.finishedAt < 0 && (slow || Math.hypot(c.x - c.stallX, c.y - c.stallY) < 1.2)) c.stall += DT;
	else {
		c.stall = 0;
		c.stallX = c.x;
		c.stallY = c.y;
	}
	if (s.hold <= 0 && c.finishedAt < 0 && Math.abs(c.d) > t.width / 2) {
		let along = c.s - c.stuckS;
		if (along < -L / 2) along += L;
		if (along > L / 2) along -= L;
		if (along >= TOW_ALONG) {
			c.stuck = 0;
			c.stuckS = c.s;
		} else c.stuck += DT;
	} else {
		c.stuck = 0;
		c.stuckS = c.s;
	}
	if (c.stuck > 4 && c.wreck <= 0) tow(s, c);
}
var TOW_ALONG = 8;
/** stalled this long, seconds, with the nose in the trees, a car reverses on its own for BACK_OUT seconds */
var BACK_AFTER = 1.5;
var BACK_OUT = 1.1;
/** The marshals' tractor: back on the road facing forward, a toast and a sound, no flash. */
function tow(s, c) {
	onRoad(s, c, false);
	if (c === s.cars[0]) {
		s.sounds.push("tow");
		s.toasts.push({
			text: {
				fi: "Hinaus",
				en: "Towed"
			},
			colour: "#e8c040",
			age: 0
		});
	}
}
/**
* A car wedged nose first in the trees backs out on its own: not a metre moved in BACK_AFTER
* seconds with the nose at a wall and pointing off the road, and the sim takes the wheel for
* BACK_OUT seconds, reversing with the wheel turned so the nose swings back to the road. It is
* the bot's back-out given to every car: the one-thumb player has the throttle on all the time
* and no reason to know the pedal reverses, so without it the car sits against the tree.
*/
function rescue(s, c, input, dt) {
	if (c.wreck > 0 || c.finishedAt >= 0 || s.hold > 0) {
		c.backOut = 0;
		return input;
	}
	if (c.backOut > 0) {
		c.backOut -= dt;
		return {
			steer: c.backSteer,
			throttle: 0,
			brake: 1,
			boost: false
		};
	}
	if (c.stall < BACK_AFTER) return input;
	const steer = backOutSteer(s, c);
	if (steer === 0) return input;
	c.backOut = BACK_OUT;
	c.backSteer = steer;
	if (c === s.cars[0]) s.toasts.push({
		text: {
			fi: "Peruuta",
			en: "Backing out"
		},
		colour: "#e6dfcc",
		age: 0
	});
	return {
		steer,
		throttle: 0,
		brake: 1,
		boost: false
	};
}
/**
* The wheel that backs a car's nose out of the trees, or 0 when the nose is not at a wall or
* already points along the way out. The way out is the road's direction, or a shortcut's when
* the nose is in a lane. Reversing swings the nose against the wheel, so the wheel goes the
* other way from where that direction lies.
*/
function backOutSteer(s, c) {
	const t = s.track;
	const fx = Math.cos(c.heading);
	const fy = Math.sin(c.heading);
	const nx = c.x + fx * c.def.length * .5;
	const ny = c.y + fy * c.def.length * .5;
	const loc = t.locate(nx, ny);
	const roadRoom = t.width / 2 + t.verge - Math.abs(loc.d);
	let room = roadRoom;
	let dir = t.at(loc.s);
	const l = t.laneAt(nx, ny);
	if (l) {
		const laneRoom = l.lane.width / 2 + 2 - l.dist;
		if (laneRoom > roadRoom) {
			room = laneRoom;
			dir = l.lane.at(l.u);
		}
	}
	if (room > .8) return 0;
	const ang = Math.atan2(fx * dir.ty - fy * dir.tx, fx * dir.tx + fy * dir.ty);
	if (Math.abs(ang) < .4) return 0;
	return ang > 0 ? -1 : 1;
}
function wheelbase(def) {
	return def.length * .62;
}
/** Radians of wheel angle at full lock, at this speed: the lock shrinks as the car goes faster. */
/** The rack's lock at this speed: full at rest, fading with speed, as on a real wheel. */
function steeringLock(def, v) {
	return def.turnRate * LOCK / (1 + Math.abs(v) / LOCK_FADE);
}
/**
* The most yaw a car can ask for at this speed, rad/s. The input's steer is a share of this,
* not of the rack: a hand asks the car to turn, and the car turns the wheel as far as the
* tyres can use. At rest the rack is the limit; at speed the grip is, with YAW_ROOM over
* it so a slide can still be provoked. Before this, at 100 km/h the rack offered four times
* the angle the front could turn into force: a thumb at full stretch saturated the front,
* then the rear, and the car slid like ice, while the bot, which already asked for yaw
* rates, stayed on rails (tools/dbg/slip.ts, 2026-10-04). Every car, every hand.
*/
function yawMax(def, v) {
	const vv = Math.max(Math.abs(v), 3);
	const rack = vv * Math.tan(steeringLock(def, v)) / wheelbase(def);
	const grip = YAW_ROOM * def.grip / vv;
	return Math.min(rack, grip);
}
//#endregion
//#region src/game/content/tracks.ts
/**
* The tracks. A track is its centreline in metres, a width and a surface,
* with its ground by arc length (rivers jumped from a bank, crests),
* patches of another surface (mud, ice) and shortcuts as lanes through the forest in world metres;
* track.ts smooths the line and the renderer draws the road from it, so a
* new track is a new list of points and nothing else. Points run
* clockwise on screen (y grows downward). The first point is the start
* line and the first segment the start straight. Roads are 6 m, about
* three cars abreast, the width of a Death Rally road: room to pass and
* no room to pass without a fight.
*/
var TRACKS = [
	{
		id: "kiviaho-lenkki",
		name: L("Kiviahon lenkki"),
		width: 6,
		surface: "gravel",
		crests: [{
			s: 18,
			len: 20,
			h: .9
		}],
		rivers: [{
			s: 171,
			gap: 8,
			bank: .45
		}],
		shortcuts: [{
			points: [
				[34, 88],
				[14, 90],
				[-6, 86],
				[-22, 74]
			],
			width: 4,
			surface: "grass"
		}],
		points: [
			[0, 0],
			[50, 0],
			[76, 6],
			[92, 28],
			[84, 54],
			[62, 68],
			[40, 82],
			[20, 100],
			[6, 116],
			[-12, 118],
			[-24, 104],
			[-22, 80],
			[-28, 56],
			[-24, 34],
			[-26, 14],
			[-14, 2]
		]
	},
	{
		id: "hirvisuo-lenkki",
		name: L("Hirvisuon lenkki"),
		width: 6,
		surface: "gravel",
		crests: [{
			s: 24,
			len: 20,
			h: .9
		}],
		rivers: [{
			s: 246,
			gap: 8,
			bank: .45
		}],
		points: [
			[0, 0],
			[60, 0],
			[88, 8],
			[100, 30],
			[86, 50],
			[64, 54],
			[52, 72],
			[42, 94],
			[22, 108],
			[-6, 110],
			[-30, 106],
			[-40, 84],
			[-42, 54],
			[-38, 26],
			[-22, 6]
		]
	},
	{
		id: "kiviaho",
		name: L("Kiviaho"),
		width: 6,
		surface: "gravel",
		crests: [{
			s: 26,
			len: 24,
			h: .9
		}],
		rivers: [{
			s: 214,
			gap: 12,
			bank: .45
		}],
		shortcuts: [{
			points: [
				[4, 168],
				[-10, 182],
				[-28, 190],
				[-46, 192],
				[-60, 184],
				[-65, 174],
				[-66, 164]
			],
			width: 4,
			surface: "grass"
		}],
		points: [
			[0, 0],
			[72, 0],
			[104, 10],
			[120, 40],
			[104, 72],
			[76, 86],
			[50, 103],
			[22, 126],
			[8, 160],
			[-4, 194],
			[-12, 222],
			[-40, 240],
			[-68, 226],
			[-78, 196],
			[-70, 176],
			[-58, 148],
			[-66, 116],
			[-58, 80],
			[-42, 52],
			[-36, 24],
			[-20, 4]
		]
	},
	{
		id: "hirvisuo",
		name: L("Hirvisuo"),
		width: 6,
		surface: "gravel",
		crests: [{
			s: 50,
			len: 24,
			h: .9
		}],
		rivers: [{
			s: 560,
			gap: 12,
			bank: .45
		}],
		points: [
			[0, 0],
			[74, 0],
			[124, 6],
			[155, 31],
			[152, 68],
			[124, 87],
			[93, 78],
			[74, 93],
			[81, 130],
			[112, 155],
			[155, 161],
			[186, 192],
			[174, 236],
			[124, 248],
			[74, 252],
			[37, 254],
			[-12, 242],
			[-43, 205],
			[-37, 161],
			[-12, 130],
			[-19, 93],
			[-50, 68],
			[-56, 31],
			[-31, 6]
		]
	}
];
Object.fromEntries(TRACKS.map((t) => [t.id, t]));
//#endregion
//#region src/game/content/cars.ts
/**
* The cars, one per class, slowest first. Numbers are the balance knobs;
* the bot in tools/ reports what they do to a lap. The classes should be
* a clear step apart with stock parts, and a fully built car of one class
* should be close to a stock car of the next, so the choice at the dealer
* is a real one. The career starts in the Tauno (docs/progression.md).
* All four are the player's red; the body, the livery and the number
* tell them apart. The footprint is real: the car model reads it, and
* it climbs with the class (the ladder is in rivals.ts): the Tauno is a
* tiny boxy old saloon, a Fiat 126 of a car.
*
* The first car of each class is the class car: the rivals' pace and the
* licence targets are read off it (classCar()). After the four come the
* dealer's wild buys, Hill Climb Racing's garage in a class's money: a
* Niva and a Valmet tractor in C, a monster truck in B, a hearse in A.
* Each handles like what it is, so the choice is a character, not a
* faster number.
*
* The pace (2026-10-04, the phone playthrough, scripts/playthrough.mjs): the lap is grip-limited,
* so every car's grip went up 12% together, after a thumb lapped Kiviaho in 37 s against the
* bot's 32. The bot laps Kiviaho in 27.6 in the Kortteli, 25.7 in the Sorsa, 23.7 in the Kiila
* (tools/dbg/gripsweep.ts); the drag was not the lever, a third of it moved the lap half a second.
*
* The Tauno is slow on purpose (2026-10-05, after the owner played it: "the speed now is like a
* really upgraded car"). Stock it pulls 10 m/s² and runs out at about 80 km/h on a straight
* (the engine's push fades toward topSpeed and the drag takes the rest), with 1.3 g of grip;
* before, 15 m/s², 105 km/h and 1.9 g, and a thumb at that speed got 60 to 80% of the yaw it
* asked for and ran wide, while a first engine upgrade made the thumb's lap slower, not faster
* (tools/dbg/jmlaps.ts). The folk class races its own short loops (tracks.ts, the lenkki
* tracks), where a new thumb laps in about 25 s stock and the full car is a clear step: the
* engine parts show as top speed and as pull out of every bend, the tyres as a corner taken
* without the pedal. JM to C is a bigger step than the other classes' tenth; the C car is as
* it was.
*/
var CARS = [
	{
		id: "tauno",
		name: L("Tauno 2.0"),
		cls: "JM",
		shape: "saloon",
		price: 1200,
		blurb: L("Pieni kulmikas jokkisauto: takaveto, pehmeä ja väsynyt. Vuotaa öljyä, ja se on ainoa aseesi.", "A tiny boxy folk-racing saloon: rear drive, soft and tired. It leaks oil, and that is your only weapon."),
		accel: 10,
		topSpeed: 32,
		brake: 10,
		turnRate: 2.6,
		grip: 13,
		mass: 1.25,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 2.9,
		width: 1.35,
		colour: "#c8352a",
		accent: "#e6dfcc",
		livery: "roof",
		number: 7
	},
	{
		id: "kortteli",
		name: L("Kortteli 1.3"),
		cls: "C",
		shape: "hatch",
		price: 2500,
		blurb: L("Väsynyt kaupunkiauto soranastoilla. Kaikki alkaa tästä.", "A tired town car on gravel tyres. Everyone starts here."),
		accel: 18,
		topSpeed: 50.5,
		brake: 16,
		turnRate: 2.8,
		grip: 22.5,
		mass: 1,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 3.7,
		width: 1.65,
		colour: "#c8352a",
		accent: "#e6dfcc",
		livery: "band",
		number: 13
	},
	{
		id: "sorsa",
		name: L("Sorsa 1.6 GT"),
		cls: "B",
		shape: "coupe",
		price: 9e3,
		blurb: L("Kevyt ja terävä. Ei anna anteeksi, mutta kääntyy.", "Light and sharp. Unforgiving, but it turns."),
		accel: 24.5,
		topSpeed: 60,
		brake: 19,
		turnRate: 3,
		grip: 26,
		mass: .95,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 4.4,
		width: 1.75,
		colour: "#c8352a",
		accent: "#e6dfcc",
		livery: "twin",
		number: 22
	},
	{
		id: "kiila",
		name: L("Kiila 4x4 Turbo"),
		cls: "A",
		shape: "rally",
		price: 28e3,
		blurb: L("Neliveto ja turbo. Metsän kuningas.", "Four-wheel drive and a turbo. King of the forest."),
		accel: 28.5,
		topSpeed: 69.5,
		brake: 22,
		turnRate: 3.1,
		grip: 29,
		frontDrive: .3,
		mass: 1.25,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 4.7,
		width: 1.9,
		colour: "#c8352a",
		accent: "#e8c040",
		livery: "works",
		number: 1
	},
	{
		id: "niva",
		name: L("Niva 1.7 4x4"),
		cls: "C",
		shape: "niva",
		price: 3800,
		blurb: L("Korkea lyhyt laatikko, neliveto ja vararengas takaovessa. Pientare on sille tietä.", "A tall short box, four-wheel drive and a spare on the back door. The verge is road to it."),
		accel: 17,
		topSpeed: 47,
		brake: 15,
		turnRate: 2.9,
		grip: 21.5,
		frontDrive: .5,
		offroad: .65,
		mass: 1.15,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 3.7,
		width: 1.7,
		colour: "#c8352a",
		accent: "#e6dfcc",
		livery: "stripe",
		number: 4
	},
	{
		id: "valmet",
		name: L("Valmet 702"),
		cls: "C",
		shape: "tractor",
		price: 3200,
		blurb: L("Traktori. Suoralla kaikki menevät ohi, mutkassa se kääntyy paikallaan, ja kolarissa se jyrää kenet tahansa.", "A tractor. Everyone passes it on a straight; it turns on the spot, and in a shunt it flattens anyone."),
		accel: 21,
		topSpeed: 30.5,
		brake: 17,
		turnRate: 3.7,
		grip: 23.5,
		offroad: .85,
		mass: 2.6,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 3.6,
		width: 1.9,
		colour: "#c8352a",
		accent: "#e6dfcc",
		livery: "roof",
		number: 7
	},
	{
		id: "monsteri",
		name: L("Monsteri"),
		cls: "B",
		shape: "monster",
		price: 13500,
		blurb: L("Lava-auto renkailla, jotka ovat isompia kuin hytti. Pomppii, ja kenen päälle se tulee, se pyörähtää.", "A pickup on tyres bigger than its cab. It bounces, and whoever it lands on spins."),
		accel: 23.5,
		topSpeed: 56.5,
		brake: 16,
		turnRate: 2.8,
		grip: 23.5,
		frontDrive: .4,
		offroad: .6,
		spinOnShunt: true,
		mass: 2.1,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 4.6,
		width: 2.6,
		colour: "#c8352a",
		accent: "#e8c040",
		livery: "split",
		number: 88
	},
	{
		id: "ruumis",
		name: L("Ruumisauto"),
		cls: "A",
		shape: "hearse",
		price: 31e3,
		blurb: L("Pitkä farmari lasiperällä, arkku ja seppele kyydissä. Nopea ja hiljainen, eikä kukaan halua sen eteen.", "A long estate with a glass back, a coffin and a wreath aboard. Fast and quiet, and nobody wants to be in front of it."),
		accel: 27.5,
		topSpeed: 73,
		brake: 21,
		turnRate: 2.9,
		grip: 28,
		mass: 1.4,
		armour: 0,
		ram: 0,
		gun: 0,
		length: 5.2,
		width: 1.8,
		colour: "#c8352a",
		accent: "#16130f",
		livery: "band",
		number: 44
	}
];
/** The class car: the first of its class, whose numbers the rivals race on. */
function classCar$1(cls) {
	return CARS.find((c) => c.cls === cls);
}
Object.fromEntries(CARS.map((c) => [c.id, c]));
//#endregion
//#region tools/autoplayer.ts
var DEFAULT_BOT = {
	look: 6,
	lookPerSpeed: .4,
	gain: 7,
	margin: 1.1,
	inside: .15,
	wide: .25,
	span: 12
};
/**
* What a poor driver does wrong, at skill 0; it fades to nothing at skill 1.
* `steer` is the wander on the wheel, a share of full lock, over two slow
* waves (rad/s) so it never looks like a metronome. `chance` is the share
* of bends a skill-0 driver brakes too late for, judged 40 m at a time,
* and `over` how much faster than the bend allows it arrives.
*/
var WOBBLE = {
	steer: .25,
	w1: 1.1,
	w2: 2.7
};
var LATE = {
	chance: .6,
	over: .7,
	bend: 40
};
/** a hash as a fraction, 0 to 1 */
var frac = (n) => hash32(n) / 4294967296;
/** The lane this car is driving, or about to turn into, and how far along it the car is (negative before the mouth). */
function laneFor(s, c, tune) {
	const t = s.track;
	if (!t.lanes.length) return null;
	const wants = tune.shortcuts || c !== s.cars[0] && c.driver.skill >= .95 && paceToPlayer(s, c) > .3;
	for (const lane of t.lanes) {
		const loc = lane.locate(c.x, c.y);
		if (loc.dist < lane.width / 2 + 2 && loc.u < lane.length - 3 && loc.u > 3 && Math.abs(c.d) > t.width / 2 + .5) return {
			lane,
			u: loc.u,
			inside: true
		};
		if (!wants) continue;
		let toEntry = lane.entryS - c.s;
		if (toEntry < -t.length / 2) toEntry += t.length;
		if (toEntry > t.length / 2) toEntry -= t.length;
		if (toEntry > -14 && toEntry < 45 && Math.abs(c.d) < t.width) return {
			lane,
			u: -toEntry,
			inside: false
		};
	}
	return null;
}
/** on grass the tyres have less than half; the bot slows for it */
function onRoadFactor(c) {
	return c.onRoad ? 1 : .7;
}
function botInput(s, c = s.cars[0], tune = DEFAULT_BOT) {
	const t = s.track;
	const skill = c.driver.skill;
	const speed = Math.max(0, c.speed);
	const look = tune.look + tune.lookPerSpeed * speed;
	const lane = laneFor(s, c, tune);
	const target = lane ? lane.lane.at(lane.u + look) : t.at(c.s + look);
	const turn = lane ? 0 : t.curvatureAhead(c.s, look + 20);
	let inside = Math.max(-1, Math.min(1, turn * 1.5)) * (t.width * tune.inside);
	let ramSteer = 0;
	let rubbing = false;
	const aggression = c.driver.aggression * skill;
	const leader = leaderOf(s);
	const aheadOfPlayer = c !== s.cars[0] && c.progress > s.cars[0].progress;
	let blockD = 0;
	let blockKeen = 0;
	for (let k = 0; k < s.cars.length; k++) {
		const o = s.cars[k];
		if (o === c || o.wreck > 0) continue;
		let gap = o.s - c.s;
		if (gap < -t.length / 2) gap += t.length;
		if (gap > t.length / 2) gap -= t.length;
		const keen = hostility(s, c, k, leader) * aggression;
		const side = Math.abs(o.d - c.d);
		if (gap > 0 && gap < 14 && side < 2.6) {
			const touching = gap < (c.def.length + o.def.length) / 2 + .6;
			if (keen > GRUDGE.punt && gap < 9 && !touching) inside = o.d;
			else {
				const room = t.width / 2 - .9;
				const left = o.d - 2.6;
				const right = o.d + 2.6;
				const side = left < -room ? right : right > room ? left : Math.abs(left - c.d) < Math.abs(right - c.d) ? left : right;
				inside = Math.max(-room, Math.min(room, side));
			}
		}
		const reach = (c.def.length + o.def.length) * .4;
		if (gap > reach * .4 && gap < reach * 1.3 && side < (c.def.width + o.def.width) / 2 + .3) rubbing = true;
		if (gap > -reach && gap < reach * .4 && side < 4.5 && side > 1.2) ramSteer += (o.d > c.d ? 1 : -1) * .5 * skill * (.6 + .4 * aggression) * (1 + GRUDGE.lean * keen);
		if (gap < -2 && gap > -GRUDGE.blockReach && side < 3.5) {
			const want = (aheadOfPlayer ? GRUDGE.blockAhead : 0) + keen;
			if (want > blockKeen) {
				blockKeen = want;
				blockD = o.d;
			}
		}
	}
	if (blockKeen > 0) {
		const w = Math.min(.8, GRUDGE.block * blockKeen) * skill * skill;
		inside += (blockD - inside) * w;
	}
	if (!lane && skill > .5) {
		const room = t.width / 2 - .9;
		const hazards = [...s.oils.map((o) => ({
			x: o.x,
			y: o.y,
			r: OIL.r
		})), ...s.mines.map((m) => ({
			x: m.x,
			y: m.y,
			r: MINE.r
		}))];
		for (const h of hazards) {
			const at = t.locate(h.x, h.y);
			let gap = at.s - c.s;
			if (gap < -t.length / 2) gap += t.length;
			if (gap > t.length / 2) gap -= t.length;
			const clear = h.r + c.def.width / 2 + .3;
			if (gap < 2 || gap > look + 10 || Math.abs(at.d - inside) > clear) continue;
			const left = at.d - clear;
			const right = at.d + clear;
			inside = Math.max(-room, Math.min(room, left < -room ? right : right > room ? left : Math.abs(left - inside) < Math.abs(right - inside) ? left : right));
		}
	}
	if (lane) inside = 0;
	const tx = target.x + -target.ty * inside;
	const ty = target.y + target.tx * inside;
	let err = Math.atan2(ty - c.y, tx - c.x) - c.heading;
	while (err > Math.PI) err -= 2 * Math.PI;
	while (err < -Math.PI) err += 2 * Math.PI;
	let yawWant = Math.max(-2.2, Math.min(2.2, err * tune.gain));
	const alphaR = Math.atan2(c.slip - c.yaw * wheelbase(c.def) * .5, Math.max(Math.abs(c.speed), 3));
	const tailOut = Math.abs(alphaR) > .1 && speed > 6;
	if (tailOut) yawWant += Math.tan(alphaR * 1.1) * Math.max(speed, 3) / wheelbase(c.def);
	const sloppy = 1 - skill;
	const who = s.cars.indexOf(c);
	const wobble = sloppy > 0 ? sloppy * WOBBLE.steer * (Math.sin(s.time * WOBBLE.w1 + who * 2.1) * .7 + Math.sin(s.time * WOBBLE.w2 + who * 4.3) * .3) : 0;
	let steer = Math.max(-1, Math.min(1, yawWant / yawMax(c.def, speed) + ramSteer + wobble));
	const stop = Math.min(c.def.brake, c.def.grip) * .7;
	const brakeDist = 8 + speed * speed / (2 * stop);
	let sharpest = 0;
	let span = tune.span ?? 30;
	if (lane) {
		span = 16;
		for (let a = 0; a <= brakeDist + 16; a += 4) {
			const k = Math.abs(lane.lane.curvatureAhead(lane.u + a, span));
			if (k > sharpest) sharpest = k;
		}
		if (!lane.inside) {
			const road = t.at(lane.lane.entryS);
			const m = lane.lane.at(0);
			const turnIn = Math.abs(Math.atan2(road.tx * m.ty - road.ty * m.tx, road.tx * m.tx + road.ty * m.ty));
			sharpest = Math.max(sharpest, turnIn * span / Math.max(10, -lane.u));
		}
	} else for (let a = 5; a <= brakeDist + 30; a += 5) {
		const k = Math.abs(t.curvatureAhead(c.s + a, span));
		if (k > sharpest) sharpest = k;
	}
	const radius = sharpest < .05 ? Infinity : span / sharpest;
	const pace = paceToPlayer(s, c);
	const margin = tune.margin * (.25 + .75 * skill) * (1 + pace * catchUp(c) * (pace > 0 ? PACING.corner.push : PACING.corner.ease));
	const bend = Math.floor(c.s / LATE.bend) + c.laps.length * 1e3 + who * 7919;
	const late = sloppy > 0 && frac(bend) < LATE.chance * sloppy ? 1 + LATE.over * sloppy : 1;
	const me = s.cars[0];
	const lead = c.progress - me.progress;
	const owed = c === me ? 0 : c.grudge[0] * aggression;
	const wait = owed > 0 && lead > 0 && lead < GRUDGE.waitRange ? 1 - Math.min(GRUDGE.waitMax, GRUDGE.wait * owed) : 1;
	const gripHere = lane ? SURFACES[lane.lane.surface].grip : 1;
	const foot = .45 + .55 * skill;
	const allowed = (rubbing ? .9 : 1) * Math.min(Math.sqrt(c.def.grip * gripHere * margin * radius) * (lane?.inside ? 1 : onRoadFactor(c)) * late, c.def.topSpeed * foot * enginePace(s, c)) * wait;
	let brake = speed > allowed ? 1 : 0;
	let throttle = brake ? 0 : speed > allowed * .95 ? .2 : foot;
	if (c.sliding && Math.abs(err) > .2) throttle = Math.min(throttle, .2);
	const here = t.at(c.s);
	const outward = (c.vx * -here.ty + c.vy * here.tx) * Math.sign(c.d);
	if (!lane && Math.abs(c.d) > t.width * tune.wide && outward > 1.5 && speed > 8) {
		brake = 1;
		throttle = 0;
	}
	if (tailOut) {
		brake = 0;
		throttle = Math.min(throttle, .35);
	}
	const straight = !lane && Math.abs(t.curvatureAhead(c.s, 60)) < .25;
	const tank = pace > .3 ? .2 : .35;
	const boost = s.hold <= 0 && straight && pace > -.5 && c.boost > tank && c.boosting <= 0 && c.spin <= 0 && speed > 8;
	return {
		steer,
		throttle,
		brake,
		boost
	};
}
//#endregion
//#region src/game/content/parts.ts
var STOCK = {
	ram: 0,
	armour: 0,
	engine: 0,
	tyres: 0,
	nitro: 0,
	weight: 0,
	brakes: 0,
	gun: 0
};
var PARTS = [
	{
		kind: "ram",
		name: L("Puskuri", "Ram bar"),
		effect: L("töytäisy sattuu heihin, ei sinuun", "a shunt hurts them, not you"),
		cost: [
			.12,
			.2,
			.32
		],
		levels: [
			L("Putkipuskuri", "Pipe bumper"),
			L("Piikkipuskuri", "Spiked bumper"),
			L("Aura", "Plough")
		],
		from: "JM"
	},
	{
		kind: "armour",
		name: L("Panssari", "Armour"),
		effect: L("kestää osumia, painaa kolarissa", "takes hits, weighs in a shunt"),
		cost: [
			.12,
			.22,
			.36
		],
		levels: [
			L("Pellit", "Plates"),
			L("Turvakaari", "A cage"),
			L("Panssarilevyt", "Armour plate")
		],
		from: "JM"
	},
	{
		kind: "engine",
		name: L("Moottori", "Engine"),
		effect: L("huippunopeus ja veto", "top speed and pull"),
		cost: [
			.15,
			.28,
			.45
		],
		levels: [
			L("Viritetty imusarja", "Tuned intake"),
			L("Nokka ja pakoputki", "Cam and exhaust"),
			L("Kilpamoottori", "Race engine")
		],
		from: "JM"
	},
	{
		kind: "tyres",
		name: L("Renkaat", "Tyres"),
		effect: L("pito mutkissa", "grip in the corners"),
		cost: [
			.12,
			.2,
			.32
		],
		levels: [
			L("Pehmeät soranastat", "Soft gravel tyres"),
			L("Kilparenkaat", "Rally tyres"),
			L("Tehdasrenkaat", "Works tyres")
		],
		from: "JM"
	},
	{
		kind: "nitro",
		name: L("Typpi", "Nitro"),
		effect: L("isompi tankki, täyttyy nopeammin", "a bigger tank that fills faster"),
		cost: [
			.12,
			.2,
			.32
		],
		levels: [
			L("Typpipullo", "A nitro bottle"),
			L("Kaksi pulloa", "Two bottles"),
			L("Typpitankki", "A nitro tank")
		],
		from: "JM"
	},
	{
		kind: "weight",
		name: L("Kevennys", "Weight"),
		effect: L("kiihtyvyys ja jarrut", "acceleration and braking"),
		cost: [
			.1,
			.18,
			.3
		],
		levels: [
			L("Penkit pois", "Seats out"),
			L("Lasikuitupellit", "Fibreglass panels"),
			L("Kaikki pois", "Everything out")
		],
		from: "C"
	},
	{
		kind: "brakes",
		name: L("Jarrut", "Brakes"),
		effect: L("jarrutus", "braking"),
		cost: [
			.08,
			.14,
			.22
		],
		levels: [
			L("Urheilupalat", "Sport pads"),
			L("Isot levyt", "Big discs"),
			L("Kilpajarrut", "Race brakes")
		],
		from: "C"
	},
	{
		kind: "gun",
		name: L("Konekivääri", "Machine gun"),
		effect: L("ampuu itsestään edessä olevaa", "fires itself at the car ahead"),
		cost: [
			.14,
			.25,
			.4
		],
		levels: [
			L("Konekivääri", "A machine gun"),
			L("Toinen piippu", "A second barrel"),
			L("Isompi kaliiperi", "Bigger calibre")
		],
		from: "C"
	}
];
Object.fromEntries(PARTS.map((p) => [p.kind, p]));
/** The car with its parts: a new def, the stock one untouched. */
function tuned(car, parts) {
	const t = parts.tyres;
	const w = parts.weight;
	const e = parts.engine;
	const b = parts.brakes;
	const a = parts.armour;
	const r = parts.ram;
	const g = parts.gun;
	const n = parts.nitro;
	return {
		...car,
		grip: car.grip * (1 + .1 * t),
		turnRate: car.turnRate * (1 + .04 * t),
		accel: car.accel * (1 + .07 * w + .09 * e - .03 * a - .01 * r),
		topSpeed: car.topSpeed * (1 + .06 * e),
		brake: car.brake * (1 + .05 * w + .12 * b),
		mass: car.mass * (1 - .06 * w + .12 * a + .04 * r),
		armour: a,
		ram: r,
		gun: g,
		nitro: n,
		tyres: t,
		engine: e,
		brakes: b,
		weight: w
	};
}
//#endregion
//#region src/game/content/rivals.ts
var RIVAL_CARS = {
	jorma: {
		JM: {
			shape: "beetle",
			name: L("Kupla"),
			colour: "#2f6fd6",
			accent: "#e6dfcc",
			livery: "stripe",
			number: 3,
			length: 2.9,
			width: 1.4,
			massScale: .9,
			skill: .85
		},
		C: {
			shape: "saloon",
			name: L("Mosse"),
			colour: "#2a5bb0",
			accent: "#e6dfcc",
			livery: "checker",
			number: 33,
			length: 4.1,
			width: 1.65,
			massScale: 1,
			skill: .6
		},
		B: {
			shape: "rally",
			name: L("Kiituri"),
			colour: "#2f6fd6",
			accent: "#e6dfcc",
			livery: "split",
			number: 8,
			length: 4.4,
			width: 1.85,
			massScale: 1.05,
			skill: .85
		},
		A: {
			shape: "hearse",
			name: L("Saattaja"),
			colour: "#22345e",
			accent: "#c9b07a",
			livery: "band",
			number: 2,
			length: 5.2,
			width: 1.8,
			massScale: 1.1,
			pace: { top: 1.02 },
			skill: .97
		}
	},
	marko: {
		JM: {
			shape: "van",
			name: L("Pikkupaku"),
			colour: "#d8a428",
			accent: "#77756c",
			livery: "primer",
			number: 66,
			length: 3.2,
			width: 1.5,
			massScale: 1,
			skill: .8
		},
		C: {
			shape: "tractor",
			name: L("Valmet"),
			colour: "#d0a02c",
			accent: "#2c2a26",
			livery: "roof",
			number: 99,
			length: 3.6,
			width: 1.9,
			massScale: 1.8,
			pace: {
				top: .6,
				accel: 1.15,
				turn: 1.4
			},
			offroad: .85,
			skill: .55
		},
		B: {
			shape: "monster",
			name: L("Monsteri"),
			colour: "#e0b030",
			accent: "#2c2a26",
			livery: "split",
			number: 44,
			length: 4.6,
			width: 2.6,
			massScale: 2.1,
			pace: {
				top: .96,
				grip: .92
			},
			offroad: .6,
			spinOnShunt: true,
			skill: .8
		},
		A: {
			shape: "plough",
			name: L("Aura-Sisu"),
			colour: "#d4a52c",
			accent: "#2c2a26",
			livery: "band",
			number: 69,
			length: 6,
			width: 2.4,
			massScale: 3.2,
			pace: {
				top: .88,
				accel: .85,
				turn: 1.3
			},
			ram: 3,
			skill: .92
		}
	},
	tapsa: {
		JM: {
			shape: "microcar",
			name: L("Mopoauto"),
			colour: "#ecebe0",
			accent: "#3c7a5a",
			livery: "stripe",
			number: 12,
			length: 2.4,
			width: 1.3,
			massScale: .6,
			pace: {
				top: .88,
				accel: .85,
				turn: 1.4
			},
			skill: .75
		},
		C: {
			shape: "niva",
			name: L("Niva"),
			colour: "#f2f2ea",
			accent: "#2a2a26",
			livery: "stripe",
			number: 21,
			length: 3.7,
			width: 1.7,
			massScale: 1.15,
			pace: {
				top: .94,
				turn: 1.05
			},
			offroad: .3,
			skill: .5
		},
		B: {
			shape: "bus",
			name: L("Linja-auto"),
			colour: "#e6e4d8",
			accent: "#2f6f8a",
			livery: "band",
			number: 18,
			length: 7.5,
			width: 2.3,
			massScale: 3,
			pace: {
				top: .86,
				accel: .8,
				turn: 1.3
			},
			skill: .75
		},
		A: {
			shape: "coupe",
			name: L("Liitäjä"),
			colour: "#f2f2ea",
			accent: "#d06a2a",
			livery: "split",
			number: 5,
			length: 4.7,
			width: 1.8,
			massScale: 1.05,
			skill: .86
		}
	}
};
/** The rival's vehicle as a def: the class car built to `parts`, under this body, bent to the machine. */
function vehicleDef(v, cls, parts) {
	const base = tuned(classCar$1(cls), parts);
	const p = v.pace ?? {};
	return {
		...base,
		id: `${base.id}:${v.shape}:${v.number}`,
		name: v.name,
		shape: v.shape,
		colour: v.colour,
		accent: v.accent,
		livery: v.livery,
		number: v.number,
		length: v.length,
		width: v.width,
		wheel: v.wheel,
		mass: base.mass * v.massScale,
		topSpeed: base.topSpeed * (p.top ?? 1),
		accel: base.accel * (p.accel ?? 1),
		turnRate: base.turnRate * (p.turn ?? 1),
		grip: base.grip * (p.grip ?? 1),
		brake: base.brake * (p.brake ?? 1),
		ram: Math.max(base.ram, v.ram ?? 0),
		offroad: v.offroad,
		spinOnShunt: v.spinOnShunt
	};
}
/** A rival on the grid of a race of this class: the driver at that vehicle's skill, in it, built to `parts`. */
function rivalEntry(rival, cls, parts, skillScale = 1) {
	const v = RIVAL_CARS[rival.id][cls];
	return {
		driver: {
			...rival,
			skill: Math.min(1, v.skill * skillScale)
		},
		car: vehicleDef(v, cls, parts)
	};
}
//#endregion
//#region tools/dbg/grid2.ts
var classCar = (c) => CARS.find((x) => x.cls === c);
if (process.env.SCRUB) setScrub(Number(process.env.SCRUB));
var cls = process.argv[2] ?? "C";
var tweak = process.env.TWEAK;
for (const t of (tweak ?? "").split(";").filter(Boolean)) {
	const [k, v] = t.split("=");
	const [who, ...path] = k.split(".");
	let o = RIVAL_CARS[who][cls];
	for (const f of path.slice(0, -1)) o = o[f] ??= {};
	o[path[path.length - 1]] = v === "x" ? void 0 : isNaN(Number(v)) ? v : Number(v);
}
var car = classCar(cls);
var parts = canCarry(cls, "mine") ? {
	...STOCK,
	gun: 1
} : STOCK;
var boot = carried(cls, {
	oil: 2,
	mines: 2,
	missiles: 2
});
var reps = Number(process.env.REPS ?? 1);
var top2 = 0;
var n = 0;
var sum = 0;
var fight = 0;
var road = 0;
for (let r = 0; r < reps; r++) for (const track of TRACKS) {
	const cells = [];
	for (const grid of [
		[
			0,
			1,
			2
		],
		[
			0,
			2,
			1
		],
		[
			1,
			0,
			2
		],
		[
			1,
			2,
			0
		],
		[
			2,
			0,
			1
		],
		[
			2,
			1,
			0
		]
	]) {
		const race = createState(track, tuned(car, parts), 3, grid.map((k) => {
			const e = rivalEntry(OPPONENTS[k], cls, parts, Number(process.env.FIELD ?? 1));
			return {
				...e,
				driver: {
					...e.driver,
					skill: e.driver.skill + r * .003
				},
				...boot
			};
		}), boot);
		while (race.cars.some((c) => c.finishedAt < 0) && race.time < 900) step(race, race.cars.map((c) => botInput(race, c)), DT);
		const order = standings(race);
		const place = order.indexOf(race.cars[0]) + 1;
		n++;
		sum += place;
		if (place <= 2) top2++;
		fight += race.cars[0].bounty + race.cars[0].ramCash;
		road += race.cars[0].cash;
		cells.push(`P${place} ${order.map((c) => c.driver.name.en[0]).join("")}`);
	}
	if (reps === 1) console.log(track.id, cells.join("  "));
}
console.log(`top two ${top2}/${n}, mean place ${(sum / n).toFixed(2)}, fight ${Math.round(fight / n)} cr a race, road ${Math.round(road / n)}`);
//#endregion
export {};
