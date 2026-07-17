import type { RoleAssignmentIdentitySource } from '../../src/application/role-assignment/index.ts'
import {
  gameId,
  roleInstanceId,
  type GameId,
  type RoleInstanceId,
} from '../../src/domain/identifiers.ts'

export class SequentialRoleAssignmentIdentitySource implements RoleAssignmentIdentitySource {
  #nextGameNumber = 1
  #nextRoleInstanceNumber = 1

  nextGameId(): GameId {
    const id = gameId(`game-${String(this.#nextGameNumber)}`)
    this.#nextGameNumber += 1
    return id
  }

  nextRoleInstanceId(): RoleInstanceId {
    const id = roleInstanceId(`role-instance-${String(this.#nextRoleInstanceNumber)}`)
    this.#nextRoleInstanceNumber += 1
    return id
  }
}
