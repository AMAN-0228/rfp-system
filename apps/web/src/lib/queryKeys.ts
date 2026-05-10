/**
 * Query-key factory.
 *
 * Every key is namespaced under `['app', appId, ...]` so we can invalidate
 * an entire tenant's cache in one call once multi-tenancy is wired. At
 * FE-0 `appId` is sourced from `env.VITE_DEFAULT_APP_ID`; the factory
 * shape does not change when the backend ships real tenant resolution.
 *
 * List keys take a `query` argument typed as a generic record. Feature
 * slices may replace these with their concrete query types.
 */

// Feature slices may replace these with their concrete query types.
type QueryShape = Readonly<Record<string, unknown>>;

export const qk = {
  auth: {
    me: (appId: number) => ['app', appId, 'auth', 'me'] as const,
  },
  supplier: {
    list: (appId: number, query: QueryShape) =>
      ['app', appId, 'supplier', 'list', query] as const,
    detail: (appId: number, id: number) =>
      ['app', appId, 'supplier', 'detail', id] as const,
  },
  rfp: {
    list: (appId: number, query: QueryShape) =>
      ['app', appId, 'rfp', 'list', query] as const,
    detail: (appId: number, id: number) =>
      ['app', appId, 'rfp', 'detail', id] as const,
  },
  template: {
    list: (appId: number) => ['app', appId, 'template', 'list'] as const,
    detail: (appId: number, id: number) =>
      ['app', appId, 'template', 'detail', id] as const,
  },
  admin: {
    inboundUnmatched: (appId: number, cursor?: number) =>
      ['app', appId, 'admin', 'inbound', 'unmatched', cursor] as const,
    inboundDetail: (appId: number, id: number) =>
      ['app', appId, 'admin', 'inbound', 'detail', id] as const,
  },
} as const;
