/**
 * Cleaning log.
 *
 * The only module here that does not touch stock. It exists because the same
 * person, on the same shared tablet, is already doing the daily count — and a
 * cleaning schedule that lives on a laminated sheet by the door gets signed at
 * the end of the week in one go, from memory.
 *
 * "Due" is derived, not stored: a daily task is due every business day, a
 * weekly one until it has been done inside the current week, monthly likewise.
 * There is no scheduler and no cron, so nothing drifts when the server is down.
 */
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { audit, businessDateFor } from './ledger.js';

export interface CleaningTaskView {
    taskId: number;
    areaCode: string;
    areaName: string;
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    doneToday: boolean;
    /** Last time it was done at all, for the weekly and monthly ones. */
    lastDoneOn: string | null;
    lastDoneBy: string | null;
    verified: boolean;
    logId: string | null;
}

export async function tasksDue(locationId: number): Promise<{
    businessDate: string;
    tasks: CleaningTaskView[];
}> {
    const businessDate = await businessDateFor(db, locationId);

    const rows = await sql<{
        task_id: number;
        area_code: string;
        area_name: string;
        name: string;
        frequency: 'daily' | 'weekly' | 'monthly';
        log_id: string | null;
        done_on: string | null;
        done_by: string | null;
        verified: boolean | null;
        last_done_on: string | null;
        last_done_by: string | null;
    }>`
        select
          t.id                     as task_id,
          a.code                   as area_code,
          a.name                   as area_name,
          t.name                   as name,
          t.frequency              as frequency,
          today.id::text           as log_id,
          today.business_date::text as done_on,
          today_user.name          as done_by,
          (today.verified_by is not null) as verified,
          last.business_date::text as last_done_on,
          last_user.name           as last_done_by
        from cleaning_tasks t
        join cleaning_areas a on a.id = t.area_id
        left join cleaning_log today
          on today.task_id = t.id and today.business_date = ${businessDate}::date
        left join users today_user on today_user.id = today.done_by
        left join lateral (
          select l.* from cleaning_log l
          where l.task_id = t.id
          order by l.business_date desc
          limit 1
        ) last on true
        left join users last_user on last_user.id = last.done_by
        where a.location_id = ${locationId}
          and t.is_active
          and a.is_active
        order by a.name, t.name
    `.execute(db);

    const tasks: CleaningTaskView[] = rows.rows.map((r) => ({
        taskId: r.task_id,
        areaCode: r.area_code,
        areaName: r.area_name,
        name: r.name,
        frequency: r.frequency,
        doneToday: r.log_id !== null,
        lastDoneOn: r.last_done_on,
        lastDoneBy: r.last_done_by,
        verified: r.verified ?? false,
        logId: r.log_id
    }));

    return { businessDate, tasks };
}

export async function logCleaning(input: {
    locationId: number;
    taskId: number;
    doneBy: number;
    photoUrl?: string | null;
    note?: string | null;
}): Promise<{ id: string; businessDate: string }> {
    const task = await db
        .selectFrom('cleaning_tasks')
        .innerJoin('cleaning_areas', 'cleaning_areas.id', 'cleaning_tasks.area_id')
        .select(['cleaning_tasks.id', 'cleaning_areas.location_id'])
        .where('cleaning_tasks.id', '=', input.taskId)
        .executeTakeFirst();
    if (!task) throw notFound(`Cleaning task ${input.taskId}`);
    if (task.location_id !== input.locationId) {
        throw badRequest('That task belongs to another outlet');
    }

    const businessDate = await businessDateFor(db, input.locationId);

    return db.transaction().execute(async (trx) => {
        try {
            const log = await trx
                .insertInto('cleaning_log')
                .values({
                    location_id: input.locationId,
                    task_id: input.taskId,
                    business_date: businessDate,
                    done_by: input.doneBy,
                    photo_url: input.photoUrl ?? null,
                    note: input.note ?? null,
                    is_demo: false
                })
                .returning('id')
                .executeTakeFirstOrThrow();

            await audit(trx, {
                userId: input.doneBy,
                action: 'cleaning.log',
                entity: 'cleaning_log',
                entityId: log.id,
                after: { taskId: input.taskId, businessDate }
            });

            return { id: String(log.id), businessDate };
        } catch (err) {
            // unique (task_id, business_date): one task, once a day. Ticking it
            // twice is a double-tap, not a second cleaning.
            if ((err as { code?: string }).code === '23505') {
                throw conflict('That task is already logged for today');
            }
            throw err;
        }
    });
}

export async function verifyCleaning(
    logId: string,
    locationId: number,
    verifiedBy: number
): Promise<void> {
    const row = await db
        .selectFrom('cleaning_log')
        .select(['id', 'done_by', 'verified_by'])
        .where('id', '=', logId)
        .where('location_id', '=', locationId)
        .executeTakeFirst();
    if (!row) throw notFound(`Cleaning log ${logId}`);
    if (row.verified_by) throw conflict('Already verified');
    if (row.done_by === verifiedBy) {
        throw badRequest('Someone else has to verify the work');
    }

    await db.transaction().execute(async (trx) => {
        await trx
            .updateTable('cleaning_log')
            .set({ verified_by: verifiedBy })
            .where('id', '=', logId)
            .execute();
        await audit(trx, {
            userId: verifiedBy,
            action: 'cleaning.verify',
            entity: 'cleaning_log',
            entityId: logId
        });
    });
}
