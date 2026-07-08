import { Kafka } from 'kafkajs';
import { Partitioners } from 'kafkajs';
import { buildKafkaClientConfig } from './buildClientConfig.js';
import { ensureIdentityKafkaTopics } from './ensureTopics.js';
import { config } from '../../config/index.js';
import { logger } from '../../logger/index.js';
let producer = null;
let connected = false;
let topicsEnsured = false;
const createProducer = () => {
    const kafka = new Kafka(buildKafkaClientConfig({
        clientId: config.kafka.clientId,
        brokers: config.kafka.brokers,
        saslUsername: config.kafka.saslUsername,
        saslPassword: config.kafka.saslPassword,
        ssl: config.kafka.ssl,
    }));
    return kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner,
    });
};
export const connectKafkaProducer = async () => {
    if (!config.kafka.enabled) {
        logger.warn('[IdentityKafka] Producer disabled');
        return;
    }
    if (connected && producer) {
        return;
    }
    try {
        if (!topicsEnsured) {
            await ensureIdentityKafkaTopics();
            topicsEnsured = true;
        }
        producer = createProducer();
        await producer.connect();
        connected = true;
        logger.info({ brokers: config.kafka.brokers }, 'Kafka producer connected');
    }
    catch (error) {
        producer = null;
        connected = false;
        logger.warn({ error, brokers: config.kafka.brokers }, 'Kafka unavailable — continuing without producer');
    }
};
export const disconnectKafkaProducer = async () => {
    if (!producer || !connected) {
        return;
    }
    await producer.disconnect();
    producer = null;
    connected = false;
    logger.info('Kafka producer disconnected');
};
export const publishKafkaEvent = async (topic, payload, key) => {
    if (!config.kafka.enabled) {
        return;
    }
    if (!producer || !connected) {
        logger.warn({ topic }, 'Kafka producer not connected — skipping event publish');
        return;
    }
    const record = {
        topic,
        messages: [
            {
                ...(key ? { key } : {}),
                value: JSON.stringify({
                    ...payload,
                    emittedAt: new Date().toISOString(),
                    service: config.serviceName,
                }),
            },
        ],
    };
    try {
        await producer.send(record);
        logger.info({ topic, key }, 'Kafka event published');
    }
    catch (error) {
        // Missing topic after a failed ensure — try create once, then republish.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('This server does not host this topic-partition') || message.includes('UNKNOWN_TOPIC_OR_PARTITION')) {
            try {
                await ensureIdentityKafkaTopics([topic]);
                await producer.send(record);
                logger.info({ topic, key }, 'Kafka event published after topic ensure');
                return;
            }
            catch (retryError) {
                logger.error({ error: retryError, topic, key }, 'Kafka event publish failed after topic ensure');
                return;
            }
        }
        logger.error({ error, topic, key }, 'Kafka event publish failed');
    }
};
