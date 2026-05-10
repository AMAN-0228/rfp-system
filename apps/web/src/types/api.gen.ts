// TODO: regenerate from OpenAPI when backend ships the schema.
// Until then, hand-typed v1 shims covering the documented response
// envelope and the placeholder domain types we reference at FE-0.

/**
 * Standard backend success envelope. Every 2xx response from the API is
 * `{ success: true, data: <payload> }`.
 */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/**
 * Pagination metadata returned alongside list endpoints. The backend
 * nests it under `data` (never at the top level) per CONVENTIONS.md.
 */
export interface CountData {
  pages: number;
  limit: number;
  totalCount: number;
  page: number;
}

/**
 * Paginated list envelope. `data.items` is the page payload; `data.countData`
 * carries paging metadata.
 */
export type ApiPaginated<T> = ApiSuccess<{ items: T[]; countData: CountData }>;

/**
 * Placeholder user shape — replace with the generated type once the
 * backend exposes a profile endpoint and an OpenAPI doc.
 */
export interface User {
  id: number;
  email: string;
  name?: string;
}
