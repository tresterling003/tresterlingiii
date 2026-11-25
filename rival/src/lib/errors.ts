/** An expected, user-presentable failure (validation, permissions, not found). */
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const notFound = (what = "That") => new AppError("not_found", `${what} wasn't found.`, 404);
export const forbidden = () => new AppError("forbidden", "You don't have access to that.", 403);
