import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('auth_providers')
    .addColumn('connection_status', 'text')
    .addColumn('last_checked_at', 'timestamp')
    .addColumn('last_error', 'text')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('auth_providers')
    .dropColumn('connection_status')
    .dropColumn('last_checked_at')
    .dropColumn('last_error')
    .execute();
}
