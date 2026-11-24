// Node resolve hook: lets extensionless TS imports ("../net") work under native type stripping.
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx)
  } catch (e) {
    if (!spec.startsWith('.')) throw e
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try {
        return await next(spec + ext, ctx)
      } catch {
        /* try next */
      }
    }
    throw e
  }
}
