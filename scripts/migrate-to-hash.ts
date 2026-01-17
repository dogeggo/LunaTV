#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * 数据迁移脚本：将播放记录和收藏从旧的独立 key 结构迁移到新的 Hash 结构
 *
 * 旧结构:
 *   u:username:pr:source+id → JSON
 *   u:username:fav:source+id → JSON
 *
 * 新结构:
 *   u:username:playrecords → Hash { "source+id": JSON, ... }
 *   u:username:favorites → Hash { "source+id": JSON, ... }
 *
 * 使用方法:
 *   pnpm tsx scripts/migrate-to-hash.ts
 *
 * 环境变量:
 *   REDIS_URL 或 UPSTASH_REDIS_REST_URL - Redis 连接地址
 *   DRY_RUN=true - 仅预览迁移，不实际执行
 *   DELETE_OLD_KEYS=true - 迁移后删除旧 key（默认保留）
 */

import { createClient } from 'redis';

// 配置
const DRY_RUN = process.env.DRY_RUN === 'true';
const DELETE_OLD_KEYS = process.env.DELETE_OLD_KEYS === 'true';
const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

if (!REDIS_URL) {
  console.error('❌ 错误: 未设置 REDIS_URL 或 UPSTASH_REDIS_REST_URL 环境变量');
  process.exit(1);
}

// 创建 Redis 客户端
const client = createClient({ url: REDIS_URL });

client.on('error', (err) => console.error('Redis 客户端错误:', err));

interface MigrationStats {
  totalUsers: number;
  playRecordsMigrated: number;
  favoritesMigrated: number;
  oldKeysDeleted: number;
  errors: string[];
}

/**
 * 获取所有用户名
 */
async function getAllUsernames(): Promise<string[]> {
  // 方法1: 从 users:list (Sorted Set) 获取
  const usersFromList = await client.zRange('users:list', 0, -1);

  // 方法2: 从旧的播放记录 key 中提取用户名
  const playRecordKeys = await client.keys('u:*:pr:*');
  const usersFromPR = new Set<string>();
  playRecordKeys.forEach((key) => {
    const match = key.match(/^u:([^:]+):pr:/);
    if (match) usersFromPR.add(match[1]);
  });

  // 方法3: 从旧的收藏 key 中提取用户名
  const favoriteKeys = await client.keys('u:*:fav:*');
  const usersFromFav = new Set<string>();
  favoriteKeys.forEach((key) => {
    const match = key.match(/^u:([^:]+):fav:/);
    if (match) usersFromFav.add(match[1]);
  });

  // 合并所有用户名
  const allUsers = new Set([
    ...usersFromList,
    ...Array.from(usersFromPR),
    ...Array.from(usersFromFav),
  ]);

  return Array.from(allUsers);
}

/**
 * 迁移单个用户的播放记录
 */
async function migrateUserPlayRecords(username: string): Promise<number> {
  const pattern = `u:${username}:pr:*`;
  const oldKeys = await client.keys(pattern);

  if (oldKeys.length === 0) {
    return 0;
  }

  console.log(`  📼 发现 ${oldKeys.length} 条播放记录`);

  if (DRY_RUN) {
    console.log(`  [预览模式] 将迁移到: u:${username}:playrecords`);
    return oldKeys.length;
  }

  // 批量读取旧数据
  const values = await client.mGet(oldKeys);

  // 准备写入新 Hash
  const hashKey = `u:${username}:playrecords`;
  const pipeline = client.multi();

  oldKeys.forEach((fullKey, idx) => {
    const value = values[idx];
    if (value) {
      // 提取 source+id 部分
      const key = fullKey.replace(`u:${username}:pr:`, '');
      pipeline.hSet(hashKey, key, value);
    }
  });

  await pipeline.exec();

  // 删除旧 key（如果启用）
  if (DELETE_OLD_KEYS) {
    await client.del(oldKeys);
    console.log(`  🗑️  已删除 ${oldKeys.length} 个旧 key`);
  }

  return oldKeys.length;
}

/**
 * 迁移单个用户的收藏
 */
async function migrateUserFavorites(username: string): Promise<number> {
  const pattern = `u:${username}:fav:*`;
  const oldKeys = await client.keys(pattern);

  if (oldKeys.length === 0) {
    return 0;
  }

  console.log(`  ⭐ 发现 ${oldKeys.length} 条收藏`);

  if (DRY_RUN) {
    console.log(`  [预览模式] 将迁移到: u:${username}:favorites`);
    return oldKeys.length;
  }

  // 批量读取旧数据
  const values = await client.mGet(oldKeys);

  // 准备写入新 Hash
  const hashKey = `u:${username}:favorites`;
  const pipeline = client.multi();

  oldKeys.forEach((fullKey, idx) => {
    const value = values[idx];
    if (value) {
      // 提取 source+id 部分
      const key = fullKey.replace(`u:${username}:fav:`, '');
      pipeline.hSet(hashKey, key, value);
    }
  });

  await pipeline.exec();

  // 删除旧 key（如果启用）
  if (DELETE_OLD_KEYS) {
    await client.del(oldKeys);
    console.log(`  🗑️  已删除 ${oldKeys.length} 个旧 key`);
  }

  return oldKeys.length;
}

/**
 * 主迁移函数
 */
async function migrate() {
  console.log('🚀 开始数据迁移...\n');
  console.log(`模式: ${DRY_RUN ? '预览模式（不会修改数据）' : '实际迁移'}`);
  console.log(`删除旧 key: ${DELETE_OLD_KEYS ? '是' : '否'}\n`);

  const stats: MigrationStats = {
    totalUsers: 0,
    playRecordsMigrated: 0,
    favoritesMigrated: 0,
    oldKeysDeleted: 0,
    errors: [],
  };

  try {
    await client.connect();
    console.log('✅ 已连接到 Redis\n');

    // 获取所有用户
    const usernames = await getAllUsernames();
    stats.totalUsers = usernames.length;

    console.log(`📊 发现 ${usernames.length} 个用户\n`);

    // 迁移每个用户的数据
    for (const username of usernames) {
      console.log(`👤 处理用户: ${username}`);

      try {
        // 迁移播放记录
        const prCount = await migrateUserPlayRecords(username);
        stats.playRecordsMigrated += prCount;

        // 迁移收藏
        const favCount = await migrateUserFavorites(username);
        stats.favoritesMigrated += favCount;

        console.log(`  ✅ 完成\n`);
      } catch (err) {
        const errorMsg = `用户 ${username} 迁移失败: ${err}`;
        console.error(`  ❌ ${errorMsg}\n`);
        stats.errors.push(errorMsg);
      }
    }

    // 打印统计信息
    console.log('\n' + '='.repeat(60));
    console.log('📈 迁移统计:');
    console.log('='.repeat(60));
    console.log(`总用户数:       ${stats.totalUsers}`);
    console.log(`播放记录迁移:   ${stats.playRecordsMigrated} 条`);
    console.log(`收藏迁移:       ${stats.favoritesMigrated} 条`);
    if (DELETE_OLD_KEYS && !DRY_RUN) {
      console.log(
        `旧 key 已删除:  ${stats.playRecordsMigrated + stats.favoritesMigrated} 个`,
      );
    }
    console.log(`错误数:         ${stats.errors.length}`);
    console.log('='.repeat(60));

    if (stats.errors.length > 0) {
      console.log('\n❌ 错误详情:');
      stats.errors.forEach((err) => console.log(`  - ${err}`));
    }

    if (DRY_RUN) {
      console.log('\n💡 提示: 这是预览模式，未实际修改数据');
      console.log(
        '   要执行实际迁移，请运行: DRY_RUN=false pnpm tsx scripts/migrate-to-hash.ts',
      );
    } else {
      console.log('\n✅ 迁移完成！');
      if (!DELETE_OLD_KEYS) {
        console.log('\n⚠️  注意: 旧 key 仍然保留，验证新结构正常工作后可运行:');
        console.log(
          '   DELETE_OLD_KEYS=true pnpm tsx scripts/migrate-to-hash.ts',
        );
      }
    }
  } catch (err) {
    console.error('\n❌ 迁移失败:', err);
    process.exit(1);
  } finally {
    await client.quit();
  }
}

// 执行迁移
migrate();
