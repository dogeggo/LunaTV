/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { loadConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { PlayRecord } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await loadConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username,
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const records = await db.getAllPlayRecords(authInfo.username);
    return NextResponse.json(records, { status: 200 });
  } catch (err) {
    console.error('获取播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await loadConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username,
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { key, record }: { key: string; record: PlayRecord } = body;

    if (!key || !record) {
      return NextResponse.json(
        { error: 'Missing key or record' },
        { status: 400 },
      );
    }

    // 验证播放记录数据
    if (!record.title || !record.source_name || record.index < 1) {
      return NextResponse.json(
        { error: 'Invalid record data' },
        { status: 400 },
      );
    }

    // 从key中解析source和id
    const [source, id] = key.split('+');
    if (!source || !id) {
      return NextResponse.json(
        { error: 'Invalid key format' },
        { status: 400 },
      );
    }

    // 获取现有播放记录以保持原始集数
    const existingRecord = await db.getPlayRecord(
      authInfo.username,
      source,
      id,
    );

    // 🔑 关键修复：信任客户端传来的 original_episodes（已经过 checkShouldUpdateOriginalEpisodes 验证）
    // 只有在客户端没有提供时，才使用数据库中的值作为 fallback
    let originalEpisodes: number;
    if (
      record.original_episodes !== undefined &&
      record.original_episodes !== null
    ) {
      // 客户端已经设置了 original_episodes，信任它（可能是更新后的值）
      originalEpisodes = record.original_episodes;
    } else {
      // 客户端没有提供，使用数据库中的值或当前 total_episodes
      originalEpisodes =
        existingRecord?.original_episodes ||
        existingRecord?.total_episodes ||
        record.total_episodes;
    }

    const finalRecord = {
      ...record,
      save_time: record.save_time ?? Date.now(),
      original_episodes: originalEpisodes,
    } as PlayRecord;

    await db.savePlayRecord(authInfo.username, source, id, finalRecord);

    // 更新播放统计（如果存储类型支持）
    if (db.isStatsSupported()) {
      await db.updatePlayStatistics(
        authInfo.username,
        source,
        id,
        finalRecord.play_time,
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('保存播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await loadConfig();
    if (authInfo.username !== process.env.USERNAME) {
      // 非站长，检查用户存在或被封禁
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username,
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const username = authInfo.username;
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // 如果提供了 key，删除单条播放记录
      const [source, id] = key.split('+');
      if (!source || !id) {
        return NextResponse.json(
          { error: 'Invalid key format' },
          { status: 400 },
        );
      }

      await db.deletePlayRecord(username, source, id);
    } else {
      // 未提供 key，则清空全部播放记录
      // 目前 DbManager 没有对应方法，这里直接遍历删除
      const all = await db.getAllPlayRecords(username);
      await Promise.all(
        Object.keys(all).map(async (k) => {
          const [s, i] = k.split('+');
          if (s && i) await db.deletePlayRecord(username, s, i);
        }),
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

/**
 * 更新用户统计数据
 * 智能计算观看时间增量，支持防刷机制
 */
// export async function updateUserStats(record: PlayRecord): Promise<void> {
//   console.log('=== updateUserStats 开始执行 ===', {
//     title: record.title,
//     source: record.source_name,
//     year: record.year,
//     index: record.index,
//     playTime: record.play_time,
//     totalTime: record.total_time,
//     saveTime: new Date(record.save_time).toLocaleString(),
//   });

//   try {
//     // 统一使用相同的movieKey格式，确保影片数量统计准确
//     const movieKey = `${record.title}_${record.source_name}_${record.year}`;
//     console.log('生成的movieKey:', movieKey);

//     // 使用包含集数信息的键来缓存每一集的播放进度
//     const episodeKey = `${record.source_name}+${record.title}-${record.year}+${record.index}`;
//     const lastProgressKey = `last_progress_${episodeKey}`;
//     const lastUpdateTimeKey = `last_update_time_${episodeKey}`;

//     // 获取上次播放进度和更新时间
//     const lastProgress = parseInt(localStorage.getItem(lastProgressKey) || '0');
//     const lastUpdateTime = parseInt(
//       localStorage.getItem(lastUpdateTimeKey) || '0',
//     );

//     // 计算观看时间增量
//     let watchTimeIncrement = 0;
//     const currentTime = Date.now();
//     const timeSinceLastUpdate = currentTime - lastUpdateTime;

//     // 放宽更新条件：只要有实际播放进度变化就更新
//     if (
//       timeSinceLastUpdate < 10 * 1000 &&
//       Math.abs(record.play_time - lastProgress) < 1
//     ) {
//       console.log(
//         `跳过统计数据更新: 时间间隔过短 (${Math.floor(timeSinceLastUpdate / 1000)}s) 且进度无变化`,
//       );
//       return;
//     }

//     // 改进的观看时间计算逻辑
//     if (record.play_time > lastProgress) {
//       // 正常播放进度增加
//       watchTimeIncrement = record.play_time - lastProgress;

//       // 如果进度增加过大（可能是快进），限制增量
//       if (watchTimeIncrement > 300) {
//         // 超过5分钟认为是快进
//         watchTimeIncrement = Math.min(
//           watchTimeIncrement,
//           Math.floor(timeSinceLastUpdate / 1000) + 60,
//         );
//         console.log(
//           `检测到快进操作: ${record.title} 第${record.index}集 - 进度增加: ${record.play_time - lastProgress}s, 限制增量为: ${watchTimeIncrement}s`,
//         );
//       }
//     } else if (record.play_time < lastProgress) {
//       // 进度回退的情况（重新观看、跳转等）
//       if (timeSinceLastUpdate > 1 * 60 * 1000) {
//         // 1分钟以上认为是重新开始观看
//         watchTimeIncrement = Math.min(record.play_time, 60); // 重新观看最多给60秒增量
//         console.log(
//           `检测到重新观看: ${record.title} 第${record.index}集 - 当前进度: ${record.play_time}s, 上次进度: ${lastProgress}s`,
//         );
//       } else {
//         // 短时间内的回退，可能是快退操作，不给增量
//         watchTimeIncrement = 0;
//         console.log(
//           `检测到快退操作: ${record.title} 第${record.index}集 - 不计入观看时间`,
//         );
//       }
//     } else {
//       // 进度相同，可能是暂停后继续，给予少量时间增量
//       if (timeSinceLastUpdate > 30 * 1000) {
//         // 30秒以上认为有观看时间
//         watchTimeIncrement = Math.min(
//           Math.floor(timeSinceLastUpdate / 1000),
//           60,
//         ); // 最多1分钟
//         console.log(
//           `检测到暂停后继续: ${record.title} 第${record.index}集 - 使用增量: ${watchTimeIncrement}s`,
//         );
//       }
//     }

//     console.log(
//       `观看时间增量计算: ${record.title} 第${record.index}集 - 增量: ${watchTimeIncrement}s`,
//     );

//     // 只要有观看时间增量就更新统计数据
//     if (watchTimeIncrement > 0) {
//       console.log(
//         `发送统计数据更新请求: 增量 ${watchTimeIncrement}s, movieKey: ${movieKey}`,
//       );
//     }
//   } catch (error) {
//     console.error('更新用户统计数据失败:', error);
//   }
// }
