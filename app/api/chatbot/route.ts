import { gateway, streamText } from "ai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { buildChatbotRagContext } from "@/lib/chatbot-rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type ChatRole = "user" | "assistant";

type IncomingHistoryMessage = {
  role?: ChatRole;
  content?: string;
};

type ChatPayload = {
  message?: string;
  history?: IncomingHistoryMessage[];
};

function parseSessionUserId(userId: string | null | undefined): bigint | null {
  if (!userId) {
    return null;
  }

  try {
    return BigInt(userId);
  } catch {
    return null;
  }
}

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeHistory(history: IncomingHistoryMessage[] | undefined): {
  role: ChatRole;
  content: string;
}[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => {
      const role: ChatRole = item.role === "assistant" ? "assistant" : "user";
      const content = typeof item.content === "string" ? sanitizeText(item.content, 1200) : "";

      return {
        role,
        content,
      } satisfies { role: ChatRole; content: string };
    })
    .filter((item) => item.content.length > 0)
    .slice(-12);
}

const CHATBOT_SYSTEM_PROMPT = [
  "Anda adalah asisten AI untuk aplikasi Screening ALR.",
  "Fokus jawaban Anda hanya pada:",
  "1) penggunaan aplikasi ini,",
  "2) konsep dan metode Systematic Literature Review (SLR),",
  "3) pengetahuan paper ilmiah dan interpretasi metadata paper,",
  "4) pengetahuan umum database literatur ilmiah.",
  "Jika pertanyaan di luar ruang lingkup tersebut, tolak dengan sopan dan arahkan kembali ke topik SLR/aplikasi.",
  "Gunakan Bahasa Indonesia yang jelas dan ringkas.",
  "Prioritaskan konteks RAG yang diberikan pada pesan user.",
  "Jika data workspace tidak cukup, katakan keterbatasannya secara jujur.",
  "Jangan mengarang angka atau data yang tidak ada di konteks.",
  "Saat memberi langkah, gunakan format praktis yang mudah diikuti.",
].join("\n");

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = parseSessionUserId(session.user.id);

  if (!userId) {
    return new Response("Invalid user identity.", { status: 400 });
  }

  let payload: ChatPayload;

  try {
    payload = (await request.json()) as ChatPayload;
  } catch {
    return new Response("Payload tidak valid.", { status: 400 });
  }

  const message = typeof payload.message === "string" ? sanitizeText(payload.message, 4000) : "";

  if (message.length === 0) {
    return new Response("Pesan tidak boleh kosong.", { status: 400 });
  }

  const history = sanitizeHistory(payload.history);
  const ragContext = await buildChatbotRagContext({
    userId,
    query: message,
  });

  const contextualizedMessage = [
    "KONTEKS RAG (gunakan sebagai sumber utama jawaban):",
    ragContext,
    "",
    "PERTANYAAN USER:",
    message,
  ].join("\n");

  const modelMessages = [
    ...history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    {
      role: "user" as const,
      content: contextualizedMessage,
    },
  ];

  const result = streamText({
    model: gateway("openai/gpt-oss-120b"),
    system: CHATBOT_SYSTEM_PROMPT,
    messages: modelMessages,
    temperature: 0.15,
    maxOutputTokens: 900,
    maxRetries: 1,
    timeout: {
      totalMs: 100_000,
    },
  });

  return result.toTextStreamResponse({
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
