/** An expected, user-presentable failure (validation, permissions, not found). */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const STATUS: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  email_taken: 409,
};

/** Database functions raise errcode P0001 with DETAIL = machine code. */
export function fromDbError(e: unknown): AppError | null {
  const err = e as { code?: string; detail?: string; message?: string };
  if (err?.code === "P0001") {
    const code = err.detail ?? "invalid";
    return new AppError(code, err.message ?? "Something went wrong.", STATUS[code] ?? 400);
  }
  if (err?.code === "23514" || err?.code === "22P02" || err?.code === "22003") {
    return new AppError("invalid", "Some of those values aren't valid.", 400);
  }
  return null;
}
