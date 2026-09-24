import type { z } from "zod";

import { query, type Transport } from "./transport.js";

/**
 * Cursor pagination (SDK 4/7 -- docs/planning/features/sdk-hardening-plan.md,
 * Phase 2, STO-617). The API's list routes take `?limit=&cursor=` and answer
 * with a plain array plus an `X-Next-Cursor` header while more remain
 * (backend/app/pagination.py); without them they return the whole list, as
 * they always have.
 */

export const NEXT_CURSOR_HEADER = "X-Next-Cursor";

export type PageRequest = {
  /** Page size, 1-500. */
  limit?: number;
  /** `nextCursor` from the previous page. */
  cursor?: string;
};

export type Page<T> = {
  items: T[];
  /** Pass back as `cursor` for the next page; `null` on the last page. */
  nextCursor: string | null;
};

export type IterateRequest = {
  /** Items fetched per request (default 100). */
  pageSize?: number;
};

type Params = Record<string, string | number | boolean | null | undefined>;

/** The three ways to read one list route. */
export type ListReader<T> = {
  /** The whole list, unpaged (the route's legacy behaviour). */
  list(params?: Params): Promise<T[]>;
  page(params: Params, request: PageRequest): Promise<Page<T>>;
  /** Every item, fetched a page at a time. */
  iterate(params: Params, request?: IterateRequest): AsyncGenerator<T>;
};

export function listReader<T>(transport: Transport, route: string, schema: z.ZodType<T>): ListReader<T> {
  const array = schema.array() as z.ZodType<T[]>;
  const page = async (params: Params, request: PageRequest): Promise<Page<T>> => {
    const { data, headers } = await transport.requestWithHeaders(
      `${route}${query({ ...params, limit: request.limit, cursor: request.cursor })}`,
      undefined,
      array,
    );
    return { items: data, nextCursor: headers.get(NEXT_CURSOR_HEADER) };
  };
  return {
    list: (params = {}) => transport.request(`${route}${query(params)}`, undefined, array),
    page,
    iterate: async function* (params, request = {}) {
      let cursor: string | undefined;
      do {
        const next = await page(params, { limit: request.pageSize ?? 100, cursor });
        yield* next.items;
        cursor = next.nextCursor ?? undefined;
      } while (cursor);
    },
  };
}

/** Collects an async iterator (e.g. `client.graphs.iterate()`) into an array. */
export async function collectAll<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}
