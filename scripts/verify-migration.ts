#!/usr/bin/env tsx
/* eslint-disable no-console */

/**
 * 验证脚本：检查新 Hash 结构的数据完整性
 *
 * 使用方法:
 *   pnpm tsx scripts/verify-migration.ts
 *
 * 环境变量:
 *   REDIS_URL 或 UPSTASH_REDIS_REST_URL - Redis 连接地址
 */

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

if (!REDIS_URL) {
  console.error('❌ 错误: 未设置 REDIS_URL 或 UPSTASH_REDIS_REST_URL 环境变量');
  process.exit(1);
}

const client = createClient({ url: REDIS_URL });
client.on('error', (err) => console.error('Redis 客户端错误:', err));

interface VerificationResult {
  username: string;
  oldPlayRecords: number;
  newPlayRecords: number;
  oldFavorites: number;
  newFavorites: number;
  playRecordsMatch: boolean;
  favoritesMatch: boolean;
}

/**
 * 获取所有用户名
 */
async function getAllUsernames(): Promise<string[]> {
  const usersFromList = await client.zRange('users:list', 0, -1);
  const playRecordKeys = await client.keys('u:*:pr:*');
  const favoriteKeys = await client.keys('u:*:fav:*');
  const hashKeys = await client.keys('u:*:playrecords');

  const usersFromPR = new Set<string>();
  playRecordKeys.forEach((key) => {
    const match = key.match(/^u:([^:]+):pr:/);
    if (match) usersFromPR.add(match[1]);
  });

  const usersFromFav = new Set<string>();
  favoriteKeys.forEach((key) => {
    const match = key.match(/^u:([^:]+):fav:/);
    if (match) usersFromFav.add(match[1]);
  });

  const usersFromHash = new Set<string>();
  hashKeys.forEach((key) => {
    const match = key.match(/^u:([^:]+):playrecords$/);
    if (match) usersFromHash.add(match[1]);
  });

  const allUsers = new Set([
    ...usersFromList,
    ...Array.from(usersFromPR),
    ...Array.from(usersFromFav),
    ...Array.from(usersFromHash),
  ]);

  return Array.from(allUsers);
}

/**
 * 验证单个用户的数据
 */
async function verifyUser(username: string): Promise<VerificationResult> {
  // 检查旧结构的播放记录
  const oldPRKeys = await client.keys(`u:${username}:pr:*`);
  const oldPlayRecords = oldPRKeys.length;

  // 检查新结构的播放记录
  const newPRHash = await client.hGetAll(`u:${username}:playrecords`);
  const newPlayRecords = Object.keys(newPRHash).length;

  // 检查旧结构的收藏
  const oldFavKeys = await client.keys(`u:${username}:fav:*`);
  const oldFavorites = oldFavKeys.length;

  // 检查新结构的收藏
  const newFavHash = await client.hGetAll(`u:${username}:favorites`);
  const newFavorites = Object.keys(newFavHash).length;

  return {
    username,
    oldPlayRecords,
    newPlayRecords,
    oldFavorites,
    newFavorites,
    playRecordsMatch: oldPlayRecords === 0 || oldPlayRecords === newPlayRecords,
    favoritesMatch: oldFavorites === 0 || oldFavorites === newFavorites,
  };
}

/**
 * 主验证函数
 */
async function verify() {
  console.log('🔍 开始验证数据迁移...\n');

  try {
    await client.connect();
    console.log('✅ 已连接到 Redis\n');

    const usernames = await getAllUsernames();
    console.log(`📊 发现 ${usernames.length} 个用户\n`);

    const results: VerificationResult[] = [];
    let allMatch = true;

    for (const username of usernames) {
      const result = await verifyUser(username);
      results.push(result);

      const prStatus = result.playRecordsMatch ? '✅' : '❌';
      const favStatus = result.favoritesMatch ? '✅' : '❌';

      console.log(`👤 ${username}`);
      console.log(
        `  ${prStatus} 播放记录: 旧=${result.oldPlayRecords}, 新=${result.newPlayRecords}`,
      );
      console.log(
        `  ${favStatus} 收藏: 旧=${result.oldFavorites}, 新=${result.newFavorites}`,
      );

      if (!result.playRecordsMatch || !result.favoritesMatch) {
        allMatch = false;
      }
    }

    // 统计信息
    console.log('\n' + '='.repeat(60));
    console.log('📈 验证统计:');
    console.log('='.repeat(60));

    const totalOldPR = results.reduce((sum, r) => sum + r.oldPlayRecords, 0);
    const totalNewPR = results.reduce((sum, r) => sum + r.newPlayRecords, 0);
    const totalOldFav = results.reduce((sum, r) => sum + r.oldFavorites, 0);
    const totalNewFav = results.reduce((sum, r) => sum + r.newFavorites, 0);

    console.log(`总用户数:           ${usernames.length}`);
    console.log(`旧播放记录总数:     ${totalOldPR}`);
    console.log(`新播放记录总数:     ${totalNewPR}`);
    console.log(`旧收藏总数:         ${totalOldFav}`);
    console.log(`新收藏总数:         ${totalNewFav}`);
    console.log('='.repeat(60));

    if (allMatch && totalNewPR > 0) {
      console.log('\n✅ 验证通过！所有数据已成功迁移到新结构');
      console.log('\n💡 下一步:');
      console.log('   1. 在生产环境测试新结构是否正常工作');
      console.log('   2. 确认无误后，运行以下命令删除旧 key:');
      console.log(
        '      DELETE_OLD_KEYS=true pnpm tsx scripts/migrate-to-hash.ts',
      );
    } else if (totalOldPR === 0 && totalNewPR === 0) {
      console.log('\n⚠️  未发现任何数据（可能尚未迁移或数据库为空）');
    } else {
      console.log('\n❌ 验证失败！数据不匹配，请检查迁移脚本');
    }
  } catch (err) {
    console.error('\n❌ 验证失败:', err);
    process.exit(1);
  } finally {
    await client.quit();
  }
}

// 执行验证
verify();
