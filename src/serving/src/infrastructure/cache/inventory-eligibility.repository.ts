import { RecentPurchase } from '../../domain/filter-rule';
import { catalogMetadataCache } from './lru-cache.provider';

export interface IInventoryEligibilityRepository {
  checkStock(itemIds: string[]): Promise<Map<string, boolean>>;
  getRecentPurchases(userId: string): Promise<RecentPurchase[]>;
}

export class InMemoryInventoryEligibilityRepository implements IInventoryEligibilityRepository {
  private stockOverrides = new Map<string, boolean>();
  private userPurchaseHistory = new Map<string, RecentPurchase[]>();

  public setStock(itemId: string, inStock: boolean): void {
    this.stockOverrides.set(itemId, inStock);
    catalogMetadataCache.set(`stock:${itemId}`, { inStock });
  }

  public recordPurchase(userId: string, itemId: string, purchaseTimestamp: number = Date.now()): void {
    const list = this.userPurchaseHistory.get(userId) || [];
    list.push({ itemId, purchaseTimestamp });
    this.userPurchaseHistory.set(userId, list);
  }

  public async checkStock(itemIds: string[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const itemId of itemIds) {
      if (this.stockOverrides.has(itemId)) {
        results.set(itemId, this.stockOverrides.get(itemId)!);
      } else {
        const cached = catalogMetadataCache.get(`stock:${itemId}`) as { inStock?: boolean } | undefined;
        if (cached && typeof cached.inStock === 'boolean') {
          results.set(itemId, cached.inStock);
        } else {
          // Default to in-stock if not explicitly marked out-of-stock
          results.set(itemId, true);
        }
      }
    }
    return results;
  }

  public async getRecentPurchases(userId: string): Promise<RecentPurchase[]> {
    return this.userPurchaseHistory.get(userId) || [];
  }
}
