#!/usr/bin/env node

/* eslint-disable no-console,@typescript-eslint/no-var-requires */
const http = require('http');
const path = require('path');
const fs = require('fs');

// 清理过期文件的函数
function cleanExpiredFiles(dirPath, maxAgeDays) {
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      // 如果目录不存在，忽略错误
      if (err.code !== 'ENOENT') {
        console.error(`Error reading directory ${dirPath}:`, err);
      }
      return;
    }

    let deletedCount = 0;
    let errorCount = 0;

    const checkFile = (file) => {
      const filePath = path.join(dirPath, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Error getting stats for ${filePath}:`, err);
          return;
        }

        if (stats.isFile() && now - stats.mtimeMs > maxAgeMs) {
          fs.unlink(filePath, (err) => {
            if (err) {
              console.error(`Error deleting ${filePath}:`, err);
              errorCount++;
            } else {
              // console.log(`Deleted expired cache file: ${filePath}`);
              deletedCount++;
            }
          });
        }
      });
    };

    files.forEach(checkFile);

    // 简单输出一下清理开始的日志，具体删除详情如果太多就不打印了
    console.log(
      `Started cleaning ${dirPath}, checking ${files.length} files...`,
    );
  });
}

// 调用 generate-manifest.js 生成 manifest.json
function generateManifest() {
  console.log('Generating manifest.json for Docker deployment...');

  try {
    const generateManifestScript = path.join(
      __dirname,
      'scripts',
      'generate-manifest.js',
    );
    require(generateManifestScript);
  } catch (error) {
    console.error('❌ Error calling generate-manifest.js:', error);
    throw error;
  }
}

generateManifest();

// 直接在当前进程中启动 standalone Server（`server.js`）
require('./server.js');

// 每 1 秒轮询一次，直到请求成功
const TARGET_URL = `http://${process.env.HOSTNAME || 'localhost'}:${
  process.env.PORT || 3000
}/login`;

const intervalId = setInterval(() => {
  console.log(`Fetching ${TARGET_URL} ...`);

  const req = http.get(TARGET_URL, (res) => {
    // 当返回 2xx 状态码时认为成功，然后停止轮询
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Server is up, stop polling.');
      clearInterval(intervalId);

      setTimeout(() => {
        // 服务器启动后，立即执行一次 cron 任务
        executeCronJob();
      }, 3000);

      // 然后设置每小时执行一次 cron 任务
      setInterval(
        () => {
          executeCronJob();
        },
        120 * 60 * 1000,
      ); // 每小时执行一次
    }
  });

  req.setTimeout(2000, () => {
    req.destroy();
  });
}, 1000);

// 执行 cron 任务的函数
function executeCronJob() {
  // 执行缓存清理 (7天过期)
  const cacheDirs = [
    path.join(__dirname, 'cache', 'image'),
    path.join(__dirname, 'cache', 'video'),
  ];

  cacheDirs.forEach((dir) => {
    cleanExpiredFiles(dir, 15);
  });

  const cronUrl = `http://127.0.0.1:${process.env.PORT || 3000}/api/cron`;

  console.log(`Executing cron job: ${cronUrl}`);

  const req = http.get(cronUrl, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Cron job executed successfully:', data);
      } else {
        console.error('Cron job failed:', res.statusCode, data);
      }
    });
  });

  req.on('error', (err) => {
    console.error('Error executing cron job:', err);
  });

  req.setTimeout(600000, () => {
    console.error('Cron job timeout');
    req.destroy();
  });
}
