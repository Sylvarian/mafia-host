export type DomainResult<Value, Failure> =
  Readonly<{ ok: true; value: Value }> | Readonly<{ ok: false; error: Failure }>

export function succeed<Value>(value: Value): Readonly<{ ok: true; value: Value }> {
  return { ok: true, value }
}

export function fail<Failure>(error: Failure): Readonly<{ ok: false; error: Failure }> {
  return { ok: false, error }
}
