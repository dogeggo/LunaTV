import { AdminConfig } from './admin.types';
import {
  ContentStat,
  EpisodeSkipConfig,
  Favorite,
  IStorage,
  PlayRecord,
  PlayStatsResult,
  UserPlayStat,
} from './types';

type CacheEntry = {
  data: any;
  expiresAt: number | null;
};

const SEARCH_HISTORY_LIMIT = 20;

export class MemoryStorage implements IStorage {
  private playRecords = new Map<string, Map<string, PlayRecord>>();
  private favorites = new Map<string, Map<string, Favorite>>();
  private searchHistory = new Map<string, string[]>();
  private users = new Map<string, string>();
  private adminConfig: AdminConfig | null = null;
  private skipConfigs = new Map<string, EpisodeSkipConfig>();
  private cache = new Map<string, CacheEntry>();

  private getUserMap<T>(store: Map<string, Map<string, T>>, userName: string): Map<string, T> {
    let userMap = store.get(userName);
    if (!userMap) {
      userMap = new Map<string, T>();
      store.set(userName, userMap);
    }
    return userMap;
  }

  private makeSkipKey(userName: string, source: string, id: string): string {
    return `${userName}::${source}::${id}`;
  }

  async getPlayRecord(userName: string, key: string): Promise<PlayRecord | null> {
    return this.playRecords.get(userName)?.get(key) ?? null;
  }

  async setPlayRecord(userName: string, key: string, record: PlayRecord): Promise<void> {
    const userMap = this.getUserMap(this.playRecords, userName);
    userMap.set(key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{ [key: string]: PlayRecord }> {
    const userMap = this.playRecords.get(userName);
    if (!userMap) return {};
    return Object.fromEntries(userMap.entries());
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    this.playRecords.get(userName)?.delete(key);
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    return this.favorites.get(userName)?.get(key) ?? null;
  }

  async setFavorite(userName: string, key: string, favorite: Favorite): Promise<void> {
    const userMap = this.getUserMap(this.favorites, userName);
    userMap.set(key, favorite);
  }

  async getAllFavorites(userName: string): Promise<{ [key: string]: Favorite }> {
    const userMap = this.favorites.get(userName);
    if (!userMap) return {};
    return Object.fromEntries(userMap.entries());
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    this.favorites.get(userName)?.delete(key);
  }

  async registerUser(userName: string, password: string): Promise<void> {
    this.users.set(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    return this.users.get(userName) === password;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    return this.users.has(userName);
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    if (this.users.has(userName)) {
      this.users.set(userName, newPassword);
    }
  }

  async deleteUser(userName: string): Promise<void> {
    this.users.delete(userName);
    this.playRecords.delete(userName);
    this.favorites.delete(userName);
    this.searchHistory.delete(userName);
    Array.from(this.skipConfigs.keys())
      .filter((key) => key.startsWith(`${userName}::`))
      .forEach((key) => this.skipConfigs.delete(key));
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    return this.searchHistory.get(userName) ?? [];
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    const history = this.searchHistory.get(userName) ?? [];
    const next = [trimmed, ...history.filter((item) => item !== trimmed)];
    this.searchHistory.set(userName, next.slice(0, SEARCH_HISTORY_LIMIT));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    if (!keyword) {
      this.searchHistory.set(userName, []);
      return;
    }
    const history = this.searchHistory.get(userName) ?? [];
    this.searchHistory.set(
      userName,
      history.filter((item) => item !== keyword)
    );
  }

  async getAllUsers(): Promise<string[]> {
    return Array.from(this.users.keys());
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    return this.adminConfig;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    this.adminConfig = config;
  }

  async getSkipConfig(userName: string, source: string, id: string): Promise<EpisodeSkipConfig | null> {
    return this.skipConfigs.get(this.makeSkipKey(userName, source, id)) ?? null;
  }

  async setSkipConfig(userName: string, source: string, id: string, config: EpisodeSkipConfig): Promise<void> {
    this.skipConfigs.set(this.makeSkipKey(userName, source, id), config);
  }

  async deleteSkipConfig(userName: string, source: string, id: string): Promise<void> {
    this.skipConfigs.delete(this.makeSkipKey(userName, source, id));
  }

  async getAllSkipConfigs(userName: string): Promise<{ [key: string]: EpisodeSkipConfig }> {
    const prefix = `${userName}::`;
    const entries = Array.from(this.skipConfigs.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, config]) => [`${config.source}+${config.id}`, config] as const);
    return Object.fromEntries(entries);
  }

  async clearAllData(): Promise<void> {
    this.playRecords.clear();
    this.favorites.clear();
    this.searchHistory.clear();
    this.users.clear();
    this.skipConfigs.clear();
    this.cache.clear();
    this.adminConfig = null;
  }

  async getCache(key: string): Promise<any | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  async setCache(key: string, data: any, expireSeconds?: number): Promise<void> {
    const expiresAt = expireSeconds ? Date.now() + expireSeconds * 1000 : null;
    this.cache.set(key, { data, expiresAt });
  }

  async deleteCache(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clearExpiredCache(prefix?: string): Promise<void> {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (prefix) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
        continue;
      }
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  async getPlayStats(): Promise<PlayStatsResult> {
    return {
      totalUsers: 0,
      totalWatchTime: 0,
      totalPlays: 0,
      avgWatchTimePerUser: 0,
      avgPlaysPerUser: 0,
      userStats: [],
      topSources: [],
      dailyStats: [],
      registrationStats: {
        todayNewUsers: 0,
        totalRegisteredUsers: 0,
        registrationTrend: [],
      },
      activeUsers: {
        daily: 0,
        weekly: 0,
        monthly: 0,
      },
    };
  }

  async getUserPlayStat(userName: string): Promise<UserPlayStat> {
    return {
      username: userName,
      totalWatchTime: 0,
      totalPlays: 0,
      lastPlayTime: 0,
      recentRecords: [],
      avgWatchTime: 0,
      mostWatchedSource: '',
    };
  }

  async getContentStats(_limit = 10): Promise<ContentStat[]> {
    return [];
  }

  async updatePlayStatistics(
    _userName: string,
    _source: string,
    _id: string,
    _watchTime: number
  ): Promise<void> {}

  async updateUserLoginStats(
    _userName: string,
    _loginTime: number,
    _isFirstLogin?: boolean
  ): Promise<void> {}
}
