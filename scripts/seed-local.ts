import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import Redis from 'ioredis';
import { env } from '../src/serving/src/config/env';

async function seedLocalDynamo() {
  console.log(`[Seed] Populating DynamoDB at table ${env.DYNAMODB_TABLE_NAME}...`);
  const client = new DynamoDBClient({
    region: env.AWS_REGION,
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
  });
  const doc = DynamoDBDocumentClient.from(client);

  const sampleUsers = ['u-12345', 'u-1001', 'u-1002', 'u-customer-101'];
  const now = Math.floor(Date.now() / 1000);
  const ttl = now + 604800; // 7 days

  for (const userId of sampleUsers) {
    try {
      await doc.send(
        new PutCommand({
          TableName: env.DYNAMODB_TABLE_NAME,
          Item: {
            userId,
            generatedAt: now,
            ttlTimestamp: ttl,
            recommendations: [
              { itemId: 'PROD-1', score: 0.95, rank: 1, title: 'Ergonomic Keyboard', priceCents: 4999, category: 'Computers' },
              { itemId: 'PROD-2', score: 0.88, rank: 2, title: 'USB-C Cable', priceCents: 999, category: 'Accessories' },
              { itemId: 'SKU-9021', score: 0.82, rank: 3, title: 'Noise-Canceling Headphones', priceCents: 19999, category: 'Electronics' },
            ],
          },
        })
      );
      console.log(`[Seed] Seeded user ${userId} in DynamoDB`);
    } catch (e: unknown) {
      console.warn(`[Seed] DynamoDB seed skipped or failed (local emulator offline): ${(e as Error).message}`);
      break;
    }
  }
}

async function seedLocalRedis() {
  console.log(`[Seed] Populating Redis / MemoryDB at endpoint ${env.MEMORYDB_CLUSTER_ENDPOINT}...`);
  const [host, portStr] = env.MEMORYDB_CLUSTER_ENDPOINT.split(':');
  const redis = new Redis({
    host: host || 'localhost',
    port: portStr ? parseInt(portStr, 10) : 6379,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  try {
    await redis.connect();

    // Create index if needed
    try {
      await redis.call(
        'FT.CREATE', 'item_idx', 'ON', 'HASH',
        'PREFIX', '1', 'item:',
        'SCHEMA',
        'v', 'VECTOR', 'HNSW', '6',
        'TYPE', 'FLOAT32',
        'DIM', '128',
        'DISTANCE_METRIC', 'COSINE',
        'M', '16',
        'EF_CONSTRUCTION', '64',
        'cat', 'TAG',
        'price', 'NUMERIC'
      );
      console.log('[Seed] Created FT.CREATE item_idx index in Redis');
    } catch (e: unknown) {
      console.log(`[Seed] Index notice: ${(e as Error).message}`);
    }

    const items = ['PROD-1', 'PROD-3', 'SKU-9021'];
    for (let i = 0; i < items.length; i++) {
      const itemId = items[i];
      const buffer = Buffer.alloc(512); // 128 * 4 bytes
      for (let j = 0; j < 128; j++) {
        buffer.writeFloatLE(0.05 + i * 0.1, j * 4);
      }

      await redis.hset(`item:${itemId}`, {
        v: buffer,
        cat: 'Electronics',
        price: '4999',
      });
      console.log(`[Seed] Indexed vector item:${itemId} in Redis`);
    }

    await redis.quit();
  } catch (e: unknown) {
    console.warn(`[Seed] Redis seed skipped (local emulator offline): ${(e as Error).message}`);
  }
}

async function main() {
  console.log('--- Starting Local Mock Seeder ---');
  await seedLocalDynamo();
  await seedLocalRedis();
  console.log('--- Seeding Completed ---');
}

if (require.main === module) {
  main().catch(console.error);
}
