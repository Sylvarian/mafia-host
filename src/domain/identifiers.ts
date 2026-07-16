declare const playerIdBrand: unique symbol
declare const gameIdBrand: unique symbol
declare const roleIdBrand: unique symbol
declare const roleInstanceIdBrand: unique symbol

// These constructors add compile-time distinctions only. The specification defines no runtime ID
// format beyond serialisable strings.
export type PlayerId = string & { readonly [playerIdBrand]: 'PlayerId' }
export type GameId = string & { readonly [gameIdBrand]: 'GameId' }
export type RoleId = string & { readonly [roleIdBrand]: 'RoleId' }
export type RoleInstanceId = string & { readonly [roleInstanceIdBrand]: 'RoleInstanceId' }

export function playerId(value: string): PlayerId {
  return value as PlayerId
}

export function gameId(value: string): GameId {
  return value as GameId
}

export function roleId(value: string): RoleId {
  return value as RoleId
}

export function roleInstanceId(value: string): RoleInstanceId {
  return value as RoleInstanceId
}
