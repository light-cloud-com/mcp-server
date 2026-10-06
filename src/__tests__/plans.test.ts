// Tests for src/utils/plans.ts - plan names, prices and limits as people read them

import { describe, it, expect } from 'vitest';
import {
  annualPrice,
  describePlan,
  includedUsage,
  pausedNotice,
  pausedOnFree,
  pendingIntervalNote,
  planName,
  price,
  requiredPlanStep,
  upgradeSuggestion,
  usageLimitNote,
} from '../utils/plans.js';
import type { PlanCatalogEntry } from '../api.js';

// The 2026-10-06 rows (docs/PRICING_REDESIGN.md §6).
const free: PlanCatalogEntry = {
  id: 'hobby',
  name: 'Hobby',
  price: 0,
  entitlements: {
    seats: 1, services: 3, sites: null, databases: 0, databasesAllowed: false, alwaysOnAllowed: false,
    customDomainsAllowed: false, maxInstances: 3, containerSizes: ['nano', 'micro'], databaseTiers: [],
    staticBandwidthGb: 20, usageCredits: 1,
  },
};
const lite: PlanCatalogEntry = {
  id: 'lite',
  name: 'Lite',
  price: 5,
  entitlements: {
    seats: 1, extraSeatAllowed: false, services: 5, sites: null, databases: 1, databasesAllowed: true,
    alwaysOnAllowed: false, customDomainsAllowed: true, maxInstances: 3, containerSizes: ['nano', 'micro'],
    databaseTiers: ['shared-dev'], staticBandwidthGb: 1000,
  },
};
const starter: PlanCatalogEntry = {
  id: 'starter',
  name: 'Starter',
  price: 19,
  entitlements: { seats: 3, extraSeatAllowed: false, services: 10, sites: null, databasesAllowed: true, alwaysOnAllowed: true },
};
const pro: PlanCatalogEntry = {
  id: 'pro',
  name: 'Pro',
  price: 49,
  entitlements: { seats: null, services: 30, sites: null, databasesAllowed: true, alwaysOnAllowed: true, annualPrice: 450 },
};

describe('plan names and prices', () => {
  it('calls the free plan Free whatever its row is named', () => {
    expect(planName(free)).toBe('Free');
    expect(planName({ id: 'hobby' })).toBe('Free');
    expect(planName(lite)).toBe('Lite');
    expect(planName({ id: 'business' })).toBe('Business');
  });

  it('prints whole-dollar prices without cents', () => {
    expect(price(5)).toBe('$5');
    expect(price(1490)).toBe('$1,490');
    expect(price(5.37)).toBe('$5.37');
  });

  it('bills a year at two months free unless the row sets its own price', () => {
    expect(annualPrice(lite)).toBe(50);
    expect(annualPrice(starter)).toBe(190);
    expect(annualPrice(pro)).toBe(450);
    expect(annualPrice(free)).toBeNull();
  });

  it("prefers the backend's own figures when it sends them", () => {
    expect(annualPrice({ ...lite, annualPrice: 48 })).toBe(48);
    expect(annualPrice({ ...free, annualPrice: 0 })).toBeNull();
    expect(includedUsage({ ...free, includedUsage: 1 })).toBe(1);
    expect(includedUsage({ id: 'x', name: 'X', price: 7 })).toBe(7);
  });
});

describe('describePlan', () => {
  it('reads Free as $1 of usage, unlimited static sites and 3 server apps', () => {
    const line = describePlan(free);
    expect(line).toContain('includes $1.00 of usage a month');
    expect(line).toContain('3 server apps');
    expect(line).toContain('unlimited static sites (20 GB of bandwidth a month, fair use)');
    expect(line).toContain('no databases');
    expect(line).toContain('no custom domains');
    expect(line).toContain("sites carry a small 'by Light Cloud' link");
    expect(line).toContain('1 member');
  });

  it('reads Lite as any kind of app with one shared database', () => {
    const line = describePlan(lite);
    expect(line).toContain('includes $5.00 of usage a month');
    expect(line).toContain('5 server apps');
    expect(line).not.toContain(' only');
    expect(line).toContain('unlimited static sites (1 TB of bandwidth a month, fair use)');
    expect(line).toContain('1 shared database');
    expect(line).toContain('custom domains');
    expect(line).not.toContain('by Light Cloud');
  });

  it('includes three members on Starter and sells no extra seats', () => {
    const line = describePlan(starter);
    expect(line).toContain('10 server apps');
    expect(line).toContain('3 members');
    expect(line).not.toContain('$9');
    expect(line).toContain('shared or dedicated databases');
  });

  it('says unlimited when a count is null', () => {
    expect(describePlan(pro)).toContain('unlimited members');
    expect(describePlan({ id: 'x', name: 'X', price: 1, entitlements: { services: null } })).toContain('unlimited server apps');
  });
});

describe('refusal next steps', () => {
  it('names the plan, its id and its price', () => {
    const step = requiredPlanStep({ id: 'lite', name: 'Lite', price: 5 });
    expect(step).toBe('Next step: call the `choose-plan` tool with plan_id `lite` (Lite, $5/month) once the user agrees, then retry this one.');
  });

  it('says so when no plan includes more', () => {
    expect(requiredPlanStep(null)).toContain('no plan includes more');
  });
});

describe('paused workspaces', () => {
  it('pauses server apps and deploys on Free, never static sites, never a bill', () => {
    const notice = pausedNotice(true, 1, '2026-11-03');
    expect(notice).toContain("Free's $1.00 of included usage is used up");
    expect(notice).toContain('server apps and deploys are paused until 2026-11-03');
    expect(notice).toContain('Static sites keep serving');
    expect(notice).toContain('never billed');
  });

  it('blames the usage limit on a paid plan', () => {
    expect(pausedNotice(false, 19)).toContain('usage limit');
  });

  it('takes the reason from the backend, else from the plan price', () => {
    expect(pausedOnFree('free_allowance', lite)).toBe(true);
    expect(pausedOnFree('usage_limit', free)).toBe(false);
    expect(pausedOnFree(undefined, free)).toBe(true);
    expect(pausedOnFree(null, lite)).toBe(false);
  });

  it('describes the usage limit and a pending interval switch', () => {
    expect(usageLimitNote({ extra: null, paused: false })).toBe('none (extra usage goes on the next invoice)');
    expect(usageLimitNote({ extra: 20, paused: true })).toBe('server apps and deploys pause after $20.00 of extra usage (reached this cycle)');
    expect(usageLimitNote(undefined)).toBeNull();
    expect(pendingIntervalNote('year')).toBe('Yearly billing starts at the next cycle.');
    expect(pendingIntervalNote(null)).toBeNull();
  });

  it('suggests the cheapest paid plan', () => {
    expect(upgradeSuggestion([starter, free, lite])).toContain('Lite is $5 a month with $5.00 of usage included');
    expect(upgradeSuggestion([free])).toBeNull();
  });
});
