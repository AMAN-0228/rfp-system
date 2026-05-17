import { outboundQueue } from '../config/queue';

const run = async () => {
    console.log('Running test script');

    const outboundQueueResult = await outboundQueue.add('test', {
        type: 'test_send',
        idempotencyKey: 'test',
        to: 'test@test.com',
        subject: 'Test Subject',
        body: 'Test Body',
    });

    console.log('Outbound queue result:', outboundQueueResult);
}

run();