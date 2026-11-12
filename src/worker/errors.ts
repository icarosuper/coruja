import type { ContentfulStatusCode } from 'hono/utils/http-status'

// Errors the API answers as `{ error: code, ...details }`. The code is stable English
// (`month_closed`); the web app turns it into a message in Portuguese.

export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code)
    this.name = 'ApiError'
  }
}
