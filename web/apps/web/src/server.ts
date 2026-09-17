import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import * as Config from 'effect/Config'
import * as Layer from 'effect/Layer'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'

import { Router } from './router.ts'
import { Auth } from './services/Auth.ts'
import { BackupLayer } from './services/Backup.ts'
import { Cipher } from './services/Cipher.ts'
import { DatabaseLayer } from './services/Database.ts'
import { Entries } from './services/Entries.ts'
import { Markdown } from './services/Markdown.ts'
import { ObjectStore } from './services/ObjectStore.ts'
import { ShareLinks } from './services/ShareLinks.ts'

const EntriesLayer = Entries.layer.pipe(Layer.provideMerge(ObjectStore.layer))

const Services = Layer.mergeAll(
  Auth.layer,
  Layer.mergeAll(
    Markdown.layer.pipe(Layer.provideMerge(EntriesLayer)),
    ShareLinks.layer,
    BackupLayer.pipe(Layer.provide(ObjectStore.layer)),
  ).pipe(Layer.provide(Layer.mergeAll(DatabaseLayer, Cipher.layer))),
  BunHttpServer.layerConfig({ port: Config.port('PORT').pipe(Config.withDefault(3123)) }),
)

const MainLayer = HttpRouter.serve(Router).pipe(Layer.provide(Services))

BunRuntime.runMain(Layer.launch(MainLayer))
