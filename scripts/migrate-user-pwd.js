#!/usr/bin/env node
/* eslint-disable no-console */

const { webcrypto } = require('crypto');
const { TextEncoder } = require('util');
const { createClient } = require('redis');

const cryptoRef = global.crypto || webcrypto;

function getRedisUrl() {
  return 'rediss://:aH7Yufl3hoxZX1Ntu5@hostdzire.dogegg.online:16379';
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await cryptoRef.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function syncUserPassword(client, userName, plainPassword) {
  const infoKey = `u:${userName}:info`;
  const exists = await client.exists(infoKey);
  const hashedPassword = await hashPassword(plainPassword);

  if (exists === 1) {
    await client.hSet(infoKey, 'password', hashedPassword);
    return 'updated';
  }

  const createdAt = Date.now();
  const userInfo = {
    role: 'user',
    banned: 'false',
    password: hashedPassword,
    tags: '["注册用户"]',
    created_at: createdAt.toString(),
  };

  await client.hSet(infoKey, userInfo);
  await client.zAdd('users:list', {
    score: createdAt,
    value: userName,
  });

  return 'created';
}

async function main() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    console.error('缺少 REDIS_URL 环境变量，无法连接 Redis。');
    process.exit(1);
  }

  const client = createClient({ url: redisUrl });
  client.on('error', (err) => {
    console.error('Redis 连接错误:', err);
  });

  await client.connect();

  let scanned = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for await (const keys of client.scanIterator({
    MATCH: 'u:*:pwd',
    COUNT: 200,
  })) {
    const keyList = typeof keys === 'string' ? [keys] : keys;
    for (const key of keyList) {
      scanned += 1;
      // console.log('key = ', key);
      const match = key.match(/^u:(.+?):pwd$/);
      if (!match) {
        skipped += 1;
        continue;
      }

      const userName = match[1];
      const plainPassword = await client.get(key);
      if (!plainPassword) {
        skipped += 1;
        continue;
      }
      // console.log('userName = ', userName);
      const result = await syncUserPassword(client, userName, plainPassword);
      if (result === 'created') {
        created += 1;
      } else if (result === 'updated') {
        updated += 1;
      }

      console.log(`[OK] ${userName}: ${result}`);
    }
  }

  await client.quit();

  console.log('----- 迁移完成 -----');
  console.log(`扫描到的用户数: ${scanned}`);
  console.log(`新建用户数: ${created}`);
  console.log(`更新密码数: ${updated}`);
  console.log(`跳过数: ${skipped}`);
}

main().catch((error) => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
