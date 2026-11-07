import "server-only";
import type { MailMessage, MailSnapshot } from "@/domain/types";
import { parseFrom } from "@/domain/mail";
import { fetchJson } from "../http";
import { accessToken } from "./oauth";
import { UpstreamError } from "./errors";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gget<T>(path: string, token: string): Promise<T> {
  const res = await fetchJson(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new UpstreamError(res.status, `Gmail ${res.status}`);
  return (await res.json()) as T;
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  snippet: string;
  payload?: { headers?: { name: string; value: string }[] };
}

function decodeEntities(s: string) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

export async function fetchInbox(limit = 20): Promise<MailSnapshot> {
  const { token, session } = await accessToken();
  // Exact unread count from the INBOX label; the message list itself is capped.
  const [label, list] = await Promise.all([
    gget<{ messagesUnread: number }>("/labels/INBOX", token),
    gget<{ messages?: { id: string }[] }>(`/messages?q=${encodeURIComponent("is:unread in:inbox")}&maxResults=${limit}`, token),
  ]);
  const ids = (list.messages ?? []).map((m) => m.id);
  const params = "format=metadata&metadataHeaders=From&metadataHeaders=Subject";
  const details = await Promise.all(ids.map((id) => gget<GmailMessage>(`/messages/${id}?${params}`, token)));
  const authuser = encodeURIComponent(session.email);
  const messages: MailMessage[] = details.map((m) => {
    const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    const from = parseFrom(h("from"));
    return {
      id: m.id,
      threadId: m.threadId,
      from: from.name,
      fromEmail: from.email,
      subject: h("subject") || "(no subject)",
      snippet: decodeEntities(m.snippet ?? ""),
      receivedAt: Number(m.internalDate),
      url: `https://mail.google.com/mail/?authuser=${authuser}#inbox/${m.threadId}`,
    };
  });
  messages.sort((a, b) => b.receivedAt - a.receivedAt);
  return {
    unreadCount: label.messagesUnread ?? messages.length,
    messages,
    canMarkRead: session.scopes.includes("https://www.googleapis.com/auth/gmail.modify"),
    fetchedAt: Date.now(),
  };
}

/** Only ever called from an explicit user action in the inbox. */
export async function markRead(id: string): Promise<void> {
  const { token, session } = await accessToken();
  if (!session.scopes.includes("https://www.googleapis.com/auth/gmail.modify")) throw new UpstreamError(403, "Mark-as-read was not granted");
  const res = await fetchJson(`${API}/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
  if (!res.ok) throw new UpstreamError(res.status, `Gmail ${res.status}`);
}
