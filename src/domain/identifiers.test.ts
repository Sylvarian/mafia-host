import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  gameId,
  playerId,
  roleId,
  roleInstanceId,
  type GameId,
  type PlayerId,
  type RoleId,
  type RoleInstanceId,
} from './identifiers.ts'

describe('domain identifiers', () => {
  it('remain serialisable strings at runtime', () => {
    const id = playerId('alice')

    expect(id).toBe('alice')
    expect(JSON.stringify({ id })).toBe('{"id":"alice"}')
  })

  it('keeps each identifier kind distinct at compile time', () => {
    expectTypeOf(playerId('alice')).toEqualTypeOf<PlayerId>()
    expectTypeOf(gameId('game-1')).toEqualTypeOf<GameId>()
    expectTypeOf(roleId('doctor')).toEqualTypeOf<RoleId>()
    expectTypeOf(roleInstanceId('doctor-1')).toEqualTypeOf<RoleInstanceId>()

    expectTypeOf<PlayerId>().not.toEqualTypeOf<GameId>()
    expectTypeOf<PlayerId>().not.toEqualTypeOf<RoleId>()
    expectTypeOf<RoleId>().not.toEqualTypeOf<RoleInstanceId>()
  })
})
