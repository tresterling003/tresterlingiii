export function avatarUrl(userId: string, updatedAt: string | Date | null | undefined): string | null {
  if (!updatedAt) return null;
  return `/api/avatars/${userId}?v=${new Date(updatedAt).getTime()}`;
}
