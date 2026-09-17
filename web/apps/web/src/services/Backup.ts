import { BunFileSystem } from '@effect/platform-bun'
import * as Config from 'effect/Config'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import * as SqlClient from 'effect/unstable/sql/SqlClient'

import { ObjectStore } from './ObjectStore.ts'

const BACKUP_INTERVAL = '1 hour'

const SNAPSHOT_PATH = '/tmp/backup.db'

const snapshotDatabaseToBucket = Effect.fn('Backup.snapshotDatabaseToBucket')(function* () {
  const sql = yield* SqlClient.SqlClient
  const fs = yield* FileSystem.FileSystem
  const store = yield* ObjectStore

  yield* fs.remove(SNAPSHOT_PATH, { force: true })
  yield* sql.unsafe('VACUUM INTO ?', [SNAPSHOT_PATH])

  const now = yield* DateTime.now
  const key = `backups/app-${DateTime.formatIso(now).slice(0, 13)}.db`
  yield* store.upload(key, Bun.file(SNAPSHOT_PATH))
  yield* Effect.log('backup uploaded').pipe(Effect.annotateLogs({ key }))
})

const runBackupsForever = Effect.gen(function* () {
  const enabled = yield* Config.boolean('BACKUP_ENABLED').pipe(Config.withDefault(false))

  if (enabled) {
    yield* snapshotDatabaseToBucket().pipe(
      Effect.catchCause((cause) => Effect.logError('backup failed', cause)),
      Effect.repeat({ schedule: Schedule.spaced(BACKUP_INTERVAL) }),
      Effect.forkScoped,
    )
  } else {
    yield* Effect.log('backups disabled')
  }
})

export const BackupLayer = Layer.effectDiscard(runBackupsForever).pipe(
  Layer.provide(BunFileSystem.layer),
)
