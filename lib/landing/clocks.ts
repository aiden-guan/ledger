/*
 * The landing page's scroll clocks, in viewport heights from the top of the page's one long
 * section: the tree grows, holds a moment, then the water clock runs (w goes from 0 to 1 over
 * WATER_VH) until the koi leaves, the river takes it to the pond, and the story after the pond
 * (STORY in story.ts) runs from STORY_AT to the end.
 */

import { WATER } from "./pond";
import { STORY } from "./story";

export const TREE_VH = 430;
export const HOLD_VH = 30;
export const WATER_VH = 300;
export const RIVER_AT = TREE_VH + HOLD_VH + WATER.leave * WATER_VH;
export const RIVER_VH = 380;
/** The last of the river's clock, with the koi at rest in the pond while it blooms. */
export const REST_VH = 45;
/** Then the rest of the story, from the koi coming to rest. */
export const STORY_AT = RIVER_AT + RIVER_VH - REST_VH;
export const TRAVEL_VH = STORY_AT + STORY.end;
