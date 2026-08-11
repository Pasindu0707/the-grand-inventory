import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import { config } from './config.js';
import { AppError } from './errors.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { itemRoutes } from './routes/items.js';
import { grnRoutes } from './routes/grn.js';
import { stockRoutes } from './routes/stock.js';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        logger:
            config.NODE_ENV === 'test'
                ? false
                : {
                      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
                      // A PIN in a log file is a PIN in a backup, forever.
                      redact: ['req.headers.authorization', 'req.body.pin'],
                  },
    }).withTypeProvider<ZodTypeProvider>();

    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    await app.register(cors, {
        origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()),
        credentials: true,
    });

    await app.register(jwt, { secret: config.JWT_SECRET });

    await app.register(rateLimit, {
        global: false,
        max: 100,
        timeWindow: '1 minute',
    });

    await app.register(authPlugin);

    app.setErrorHandler((err, req, reply) => {
        if (err instanceof AppError) {
            return reply
                .status(err.statusCode)
                .send({ error: err.code, message: err.message, details: err.details });
        }

        const asRecord = err as unknown as { validation?: unknown; message?: string };
        if (err instanceof ZodError || asRecord.validation) {
            return reply.status(400).send({
                error: 'VALIDATION_FAILED',
                message: asRecord.message ?? 'Request failed validation',
                details: asRecord.validation,
            });
        }

        if ((err as { statusCode?: number }).statusCode === 429) {
            return reply
                .status(429)
                .send({ error: 'TOO_MANY_REQUESTS', message: 'Slow down and try again shortly' });
        }

        req.log.error({ err }, 'unhandled error');
        return reply
            .status(500)
            .send({ error: 'INTERNAL', message: 'Something went wrong on our side' });
    });

    const v1 = '/api/v1';
    await app.register(healthRoutes, { prefix: v1 });
    await app.register(authRoutes, { prefix: `${v1}/auth` });
    await app.register(itemRoutes, { prefix: v1 });
    await app.register(grnRoutes, { prefix: v1 });
    await app.register(stockRoutes, { prefix: v1 });

    return app;
}
