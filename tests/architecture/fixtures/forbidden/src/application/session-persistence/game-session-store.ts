export interface GameSessionStore {
  load(): unknown
}

export const gameSessionStoreContract = 'application-persistence-contract'
