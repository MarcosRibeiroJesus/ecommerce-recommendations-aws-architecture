import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'poc']).default('development'),
  PORT: z.coerce.number().default(8080),
  AWS_REGION: z.string().default('us-east-1'),
  DYNAMODB_TABLE_NAME: z.string().default('user_recommendations'),
  DYNAMODB_ENDPOINT: z.string().optional(),
  MEMORYDB_CLUSTER_ENDPOINT: z.string().default('localhost:6379'),
  SAGEMAKER_ENDPOINT_NAME: z.string().default('recommendation-serverless-endpoint'),
  SAGEMAKER_ENDPOINT_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(override?: Partial<EnvConfig>): EnvConfig {
  const parsed = envSchema.safeParse({
    ...process.env,
    ...override,
  });

  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    throw new Error(`Environment configuration validation error: ${errorDetails}`);
  }

  return parsed.data;
}

export const env = loadEnv();
