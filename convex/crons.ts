import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/* The investigator works without being asked: one full investigation every morning (Pacific). */
const crons = cronJobs();

crons.daily("morning investigation", { hourUTC: 14, minuteUTC: 0 }, internal.investigations.scheduled, {});

export default crons;
