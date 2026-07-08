import { Kafka } from 'kafkajs';
import { buildKafkaClientConfig } from './buildClientConfig.js';
import { config } from '../../config/index.js';
import { logger } from '../../logger/index.js';
import { KAFKA_TOPICS } from '../../constants/kafka/index.js';

const DEFAULT_NUM_PARTITIONS = 3;
const DEFAULT_REPLICATION_FACTOR = 3;

export const IDENTITY_REQUIRED_TOPICS = Object.values(KAFKA_TOPICS);

export const ensureIdentityKafkaTopics = async (
  topics: readonly string[] = IDENTITY_REQUIRED_TOPICS,
): Promise<void> => {
  if (!config.kafka.enabled || topics.length === 0) {
    return;
  }

  const kafka = new Kafka(buildKafkaClientConfig({
    clientId: `${config.kafka.clientId}-admin`,
    brokers: config.kafka.brokers,
    saslUsername: config.kafka.saslUsername,
    saslPassword: config.kafka.saslPassword,
    ssl: config.kafka.ssl,
  }));

  const admin = kafka.admin();
  try {
    await admin.connect();
    const existing = await admin.listTopics();
    const missing = topics.filter((topic) => !existing.includes(topic));

    if (missing.length === 0) {
      logger.info({ topics }, '[IdentityKafka] Required topics already exist');
      return;
    }

    await admin.createTopics({
      waitForLeaders: true,
      topics: missing.map((topic) => ({
        topic,
        numPartitions: DEFAULT_NUM_PARTITIONS,
        replicationFactor: DEFAULT_REPLICATION_FACTOR,
      })),
    });

    logger.info({ created: missing }, '[IdentityKafka] Created missing topics');
  } catch (error) {
    logger.warn(
      { error, topics },
      '[IdentityKafka] Topic ensure failed — create topics manually in Confluent if the API key lacks CreateTopics',
    );
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
};
