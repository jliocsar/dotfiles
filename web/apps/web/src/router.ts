import * as Layer from 'effect/Layer'

import { ApiRoutes } from './routes/api.ts'
import { AssetRoutes } from './routes/assets.ts'
import { AuthRoutes, SessionGate } from './routes/auth.tsx'
import { EntriesRoutes, SharedRoutes } from './routes/entries.tsx'

const Gated = Layer.mergeAll(EntriesRoutes, ApiRoutes).pipe(Layer.provide(SessionGate))

export const Router = Layer.mergeAll(Gated, AuthRoutes, SharedRoutes, AssetRoutes)
