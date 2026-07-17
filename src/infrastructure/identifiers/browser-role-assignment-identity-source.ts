import type { RoleAssignmentIdentitySource } from '@/application/role-assignment/identity-source.ts'
import { gameId, roleInstanceId, type GameId, type RoleInstanceId } from '@/domain/identifiers.ts'

type CryptoUuidSource = Readonly<{
  randomUUID?: () => string
}>

export class BrowserRoleAssignmentIdentitySource implements RoleAssignmentIdentitySource {
  readonly #sessionToken: string
  #nextGameNumber = 1
  #nextRoleInstanceNumber = 1

  constructor(cryptoSource?: CryptoUuidSource) {
    const sessionCrypto = cryptoSource ?? getBrowserCrypto()
    const randomUUID = sessionCrypto.randomUUID

    if (randomUUID === undefined) {
      throw new Error('Web Crypto randomUUID() is required to create browser-session identities.')
    }

    const sessionToken = randomUUID.call(sessionCrypto)

    if (typeof sessionToken !== 'string' || sessionToken.trim().length === 0) {
      throw new Error('Web Crypto randomUUID() returned an empty browser-session identity.')
    }

    this.#sessionToken = sessionToken
  }

  nextGameId(): GameId {
    const sequence = this.#takeNextSequence('game')
    return gameId(`game-${this.#sessionToken}-${String(sequence)}`)
  }

  nextRoleInstanceId(): RoleInstanceId {
    const sequence = this.#takeNextSequence('role-instance')
    return roleInstanceId(`role-instance-${this.#sessionToken}-${String(sequence)}`)
  }

  #takeNextSequence(identityKind: 'game' | 'role-instance'): number {
    const sequence = identityKind === 'game' ? this.#nextGameNumber : this.#nextRoleInstanceNumber

    if (!Number.isSafeInteger(sequence)) {
      throw new RangeError(`The ${identityKind} identity sequence is exhausted.`)
    }

    if (identityKind === 'game') {
      this.#nextGameNumber += 1
    } else {
      this.#nextRoleInstanceNumber += 1
    }

    return sequence
  }
}

function getBrowserCrypto(): CryptoUuidSource {
  if (typeof globalThis.crypto === 'undefined') {
    throw new Error('Web Crypto is required to create browser-session identities.')
  }

  return globalThis.crypto
}
