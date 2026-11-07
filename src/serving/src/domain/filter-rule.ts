import { MergedCandidate } from './candidate';

export interface RecentPurchase {
  itemId: string;
  purchaseTimestamp: number; // ms epoch
}

export interface FilterContext {
  userId: string;
  userCountry?: string;
  recentPurchases?: RecentPurchase[];
}

export interface IFilterRule {
  readonly ruleName: string;
  evaluate(candidate: MergedCandidate, context: FilterContext): boolean;
}

export class OutOfStockFilterRule implements IFilterRule {
  readonly ruleName = 'OutOfStockFilterRule';

  public evaluate(candidate: MergedCandidate): boolean {
    return candidate.inStock !== false;
  }
}

export class RecentPurchaseSuppressionRule implements IFilterRule {
  readonly ruleName = 'RecentPurchaseSuppressionRule';
  private suppressionWindowMs: number;

  constructor(suppressionWindowDays = 30) {
    this.suppressionWindowMs = suppressionWindowDays * 24 * 60 * 60 * 1000;
  }

  public evaluate(candidate: MergedCandidate, context: FilterContext): boolean {
    if (!context.recentPurchases || context.recentPurchases.length === 0) {
      return true;
    }

    const now = Date.now();
    const purchase = context.recentPurchases.find((p) => p.itemId === candidate.itemId);
    if (!purchase) {
      return true;
    }

    // If purchased within 30 days, suppress
    const elapsed = now - purchase.purchaseTimestamp;
    return elapsed > this.suppressionWindowMs;
  }
}

export class CategorySuppressionRule implements IFilterRule {
  readonly ruleName = 'CategorySuppressionRule';
  private restrictedCategories: Set<string>;

  constructor(restrictedCategories: string[] = ['Weapons', 'Tobacco', 'Adult']) {
    this.restrictedCategories = new Set(restrictedCategories.map((c) => c.toLowerCase()));
  }

  public evaluate(candidate: MergedCandidate): boolean {
    if (!candidate.category) {
      return true;
    }
    return !this.restrictedCategories.has(candidate.category.toLowerCase());
  }
}

export class GeoRestrictionRule implements IFilterRule {
  readonly ruleName = 'GeoRestrictionRule';
  private allowedCountriesByItem: Map<string, string[]>;

  constructor(allowedCountriesByItem: Map<string, string[]> = new Map()) {
    this.allowedCountriesByItem = allowedCountriesByItem;
  }

  public evaluate(candidate: MergedCandidate, context: FilterContext): boolean {
    if (!context.userCountry) {
      return true;
    }

    const allowed = this.allowedCountriesByItem.get(candidate.itemId);
    if (!allowed || allowed.length === 0) {
      return true; // No geo restriction defined for this item
    }

    return allowed.includes(context.userCountry.toUpperCase());
  }
}
