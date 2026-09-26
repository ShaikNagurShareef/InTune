import { notFound } from "./errors";
import { uuid } from "./validation";

export interface Ctx<P extends Record<string, string>> {
  params: Promise<P>;
}

/** Malformed IDs get the same 404 as missing ones, so identifiers cannot be probed. */
export async function idParam<P extends Record<string, string>>(ctx: Ctx<P>, key: keyof P): Promise<string> {
  const value = (await ctx.params)[key];
  if (!uuid.safeParse(value).success) throw notFound();
  return value;
}
