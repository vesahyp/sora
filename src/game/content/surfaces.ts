import type { Surface } from '../types';

/**
 * What each surface does to a tyre and to the car. The car's own `grip`
 * is on gravel; a surface scales it. The tyre's lateral force rises with
 * the slip angle to its peak at `peak` radians, then falls smoothly to
 * `slide` of the peak as the tyre slides further: a slide holds on, it
 * does not fall off a cliff, and the drop is what lets a car hang its
 * tail out. `drag` is a pull on the whole velocity, per second (water,
 * mud), `top` a share of the car's top speed. `splash` throws water.
 */
export interface SurfaceDef {
  grip: number;
  peak: number;
  slide: number;
  drag: number;
  top: number;
  splash?: boolean;
}

export const SURFACES: Record<Surface, SurfaceDef> = {
  gravel: { grip: 1, peak: 0.13, slide: 0.8, drag: 0, top: 1 },
  tarmac: { grip: 1.12, peak: 0.1, slide: 0.72, drag: 0, top: 1 },
  grass: { grip: 0.55, peak: 0.16, slide: 0.82, drag: 0.08, top: 0.7 },
  mud: { grip: 0.5, peak: 0.2, slide: 0.85, drag: 0.6, top: 0.6 },
  water: { grip: 0.6, peak: 0.18, slide: 0.85, drag: 0.45, top: 0.6, splash: true },
  ice: { grip: 0.22, peak: 0.08, slide: 0.9, drag: 0, top: 1 },
};
