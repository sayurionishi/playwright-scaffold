import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ZodType, ZodTypeDef } from 'zod';
import { appConfig } from '../../config/app.config';

export interface ApiResult<T> {
  status: number;
  ok: boolean;
  /** Raw parsed JSON body (unknown until validated). */
  body: unknown;
  /** Body validated + typed by the supplied Zod schema (only present when a schema was passed). */
  data: T;
  headers: Record<string, string>;
  response: APIResponse;
}

interface RequestOptions<T> {
  /**
   * Zod schema to validate the response body against. Strongly recommended for every call.
   *
   * The input type is `unknown` (not `T`) because we're parsing an untrusted JSON body. That also
   * lets schemas whose input and output types differ — anything using `.default()`, `.transform()`,
   * or `.coerce` — be passed here. Salesforce's `describe` schemas need exactly that.
   */
  schema?: ZodType<T, ZodTypeDef, unknown>;
  /** Query params appended to the URL. */
  params?: Record<string, string | number | boolean>;
  /** JSON request body. */
  data?: unknown;
  /** Extra headers (merged over defaults). */
  headers?: Record<string, string>;
  /** Expected status; when set, a mismatch throws with the body for fast debugging. */
  expectStatus?: number;
}

/**
 * Thin, typed wrapper over Playwright's APIRequestContext.
 *
 * The `apiRequest` fixture (fixtures/api/api-fixture.ts) constructs one of these per test.
 *
 * Pass a Zod schema and the response is validated at runtime AND typed at compile time:
 *   const { data } = await api.get(ApiEndpoints.PRODUCTS, { schema: ProductListSchema });
 *   //      ^ typed as the schema's output; throws if the live response drifts from the contract.
 *
 * Contract drift is a BUG to file (test.skip + // FIXME), never a reason to loosen the schema.
 */
export class ApiRequest {
  /**
   * @param request Playwright's request context.
   * @param baseUrl Host to prefix relative paths with. Defaults to `appConfig.apiUrl`.
   *   The Salesforce `org` fixture passes the org's instance URL here, because that host comes
   *   from the token response at runtime and differs per persona and per sandbox refresh.
   */
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string = appConfig.apiUrl,
  ) {}

  private url(path: string): string {
    return path.startsWith('http') ? path : `${this.baseUrl}${path}`;
  }

  private async handle<T>(
    response: APIResponse,
    options: RequestOptions<T>,
  ): Promise<ApiResult<T>> {
    const status = response.status();
    if (options.expectStatus !== undefined && status !== options.expectStatus) {
      const text = await response.text();
      throw new Error(
        `Expected status ${options.expectStatus} but got ${status} for ${response.url()}\n${text}`,
      );
    }

    let body: unknown = undefined;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    const data = options.schema ? options.schema.parse(body) : (body as T);
    return { status, ok: response.ok(), body, data, headers: response.headers(), response };
  }

  async get<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    const response = await this.request.get(this.url(path), {
      params: options.params,
      headers: options.headers,
    });
    return this.handle(response, options);
  }

  async post<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    const response = await this.request.post(this.url(path), {
      params: options.params,
      headers: options.headers,
      data: options.data as object | undefined,
    });
    return this.handle(response, options);
  }

  async put<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    const response = await this.request.put(this.url(path), {
      params: options.params,
      headers: options.headers,
      data: options.data as object | undefined,
    });
    return this.handle(response, options);
  }

  async patch<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    const response = await this.request.patch(this.url(path), {
      params: options.params,
      headers: options.headers,
      data: options.data as object | undefined,
    });
    return this.handle(response, options);
  }

  async delete<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>> {
    const response = await this.request.delete(this.url(path), {
      params: options.params,
      headers: options.headers,
      data: options.data as object | undefined,
    });
    return this.handle(response, options);
  }
}
