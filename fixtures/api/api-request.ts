import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { TypeOf, ZodType, ZodTypeDef } from 'zod';
import { ZodError } from 'zod';
import { appConfig } from '@config/app.config';

/** Any Zod schema capable of parsing an untrusted JSON body. */
type BodySchema = ZodType<unknown, ZodTypeDef, unknown>;

export interface ApiResult<T> {
  status: number;
  ok: boolean;
  /** Raw parsed JSON body, always `unknown` — it has not been validated. */
  body: unknown;
  /**
   * The response body, validated by the supplied Zod schema and typed as its output.
   *
   * When no schema was passed this is `unknown` BY DESIGN — see the note on the class below.
   */
  data: T;
  headers: Record<string, string>;
  response: APIResponse;
}

interface BaseOptions {
  /** Query params appended to the URL. */
  params?: Record<string, string | number | boolean>;
  /** JSON request body. */
  data?: unknown;
  /** Extra headers (merged over defaults). */
  headers?: Record<string, string>;
  /** Expected status; when set, a mismatch throws with the body for fast debugging. */
  expectStatus?: number;
}

interface ValidatedOptions<S extends BodySchema> extends BaseOptions {
  /**
   * Zod schema to validate the response body against.
   *
   * The schema's INPUT type is `unknown` because we are parsing an untrusted JSON body. That also
   * allows schemas whose input and output types differ — anything using `.default()`,
   * `.transform()` or `.coerce`. Salesforce's `describe` schemas need exactly that.
   */
  schema: S;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Thin, typed wrapper over Playwright's APIRequestContext.
 *
 * The `apiRequest` fixture (fixtures/api/api-fixture.ts) constructs one per test.
 *
 *   const { data } = await api.get(ApiEndpoints.PRODUCTS, { schema: ProductListSchema });
 *   //      ^ typed as the schema's output, and validated at runtime.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY `data` IS `unknown` WITHOUT A SCHEMA — and why this is the shape of Constitution #7
 *
 * This class used to be generic over a caller-supplied `T`:
 *
 *     async get<T = unknown>(path: string, options: RequestOptions<T> = {}): Promise<ApiResult<T>>
 *     const data = options.schema ? options.schema.parse(body) : (body as T);   // ❌
 *
 * So a caller could write `api.post<{ id: string }>(path, { data })` with NO schema and receive
 * fully-typed, entirely UNVALIDATED data, with no diagnostic anywhere. The type was a fiction. The
 * scaffold's own reference fixture did exactly that, and the consequence was the shipped example
 * of the bug: against a 500 or an HTML error page, `user.id` was `undefined`, the teardown branch
 * silently did nothing, and the test failed forty lines later on something unrelated.
 *
 * Rule #7 ("never skip response validation") could therefore be broken by ACCIDENT, and following
 * it was the opt-in path. That is backwards, and no lint rule fixes it — the type system has to.
 *
 * Now the two cases are separate overloads:
 *
 *   • schema passed    → `data` is the schema's output type, validated at runtime.
 *   • no schema passed → `data` is `unknown`, so the compiler will not let you read a field off
 *                        it without narrowing. Legitimate schema-less calls still work: a 204
 *                        with no body, a status-only assertion, or best-effort teardown never
 *                        touch `data`.
 *
 * The result is that skipping validation is no longer invisible — it shows up as an `unknown` you
 * have to deal with, exactly where the risk is.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
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

  private async send(
    method: HttpMethod,
    path: string,
    options: BaseOptions & { schema?: BodySchema },
  ): Promise<ApiResult<unknown>> {
    const url = this.url(path);
    const response = await this.request[method](url, {
      params: options.params,
      headers: options.headers,
      ...(method === 'get' ? {} : { data: options.data as object | undefined }),
    });

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

    let data: unknown = body;
    if (options.schema !== undefined) {
      try {
        data = options.schema.parse(body);
      } catch (error) {
        /* A bare ZodError reads "Invalid input: expected string" with no URL, no status and no
           body — the opposite of the diagnosability standard playwright.config.ts sets for
           itself. Contract drift is a bug to FILE, so the message has to contain enough to file
           it without re-running anything. */
        if (error instanceof ZodError) {
          const preview = text.length > 800 ? `${text.slice(0, 800)}…[truncated]` : text;
          throw new Error(
            `Response did not match its schema.\n` +
              `  ${method.toUpperCase()} ${url}\n` +
              `  status: ${status}\n` +
              `  issues:\n${error.issues
                .map((i) => `    - ${i.path.join('.') || '(root)'}: ${i.message}`)
                .join('\n')}\n` +
              `  body: ${preview}\n\n` +
              `This is contract DRIFT. File it (test.skip + // FIXME: <ticket>) — do not loosen ` +
              `the schema to make it pass (Constitution #13).`,
            { cause: error },
          );
        }
        throw error;
      }
    }

    return { status, ok: response.ok(), body, data, headers: response.headers(), response };
  }

  async get<S extends BodySchema>(
    path: string,
    options: ValidatedOptions<S>,
  ): Promise<ApiResult<TypeOf<S>>>;
  async get(path: string, options?: BaseOptions): Promise<ApiResult<unknown>>;
  async get(
    path: string,
    options: BaseOptions & { schema?: BodySchema } = {},
  ): Promise<ApiResult<unknown>> {
    return this.send('get', path, options);
  }

  async post<S extends BodySchema>(
    path: string,
    options: ValidatedOptions<S>,
  ): Promise<ApiResult<TypeOf<S>>>;
  async post(path: string, options?: BaseOptions): Promise<ApiResult<unknown>>;
  async post(
    path: string,
    options: BaseOptions & { schema?: BodySchema } = {},
  ): Promise<ApiResult<unknown>> {
    return this.send('post', path, options);
  }

  async put<S extends BodySchema>(
    path: string,
    options: ValidatedOptions<S>,
  ): Promise<ApiResult<TypeOf<S>>>;
  async put(path: string, options?: BaseOptions): Promise<ApiResult<unknown>>;
  async put(
    path: string,
    options: BaseOptions & { schema?: BodySchema } = {},
  ): Promise<ApiResult<unknown>> {
    return this.send('put', path, options);
  }

  async patch<S extends BodySchema>(
    path: string,
    options: ValidatedOptions<S>,
  ): Promise<ApiResult<TypeOf<S>>>;
  async patch(path: string, options?: BaseOptions): Promise<ApiResult<unknown>>;
  async patch(
    path: string,
    options: BaseOptions & { schema?: BodySchema } = {},
  ): Promise<ApiResult<unknown>> {
    return this.send('patch', path, options);
  }

  async delete<S extends BodySchema>(
    path: string,
    options: ValidatedOptions<S>,
  ): Promise<ApiResult<TypeOf<S>>>;
  async delete(path: string, options?: BaseOptions): Promise<ApiResult<unknown>>;
  async delete(
    path: string,
    options: BaseOptions & { schema?: BodySchema } = {},
  ): Promise<ApiResult<unknown>> {
    return this.send('delete', path, options);
  }
}
