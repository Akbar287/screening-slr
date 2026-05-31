"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Loader2,
  SendHorizonal,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

const LOCAL_STORAGE_KEY = "screening-alr-chatbot-v1";
const QUICK_PROMPTS = [
  "Bagaimana alur screening yang ideal di aplikasi ini?",
  "Bedanya Inclusion Criteria dan Exclusion Criteria apa?",
  "Tips memilih database paper untuk topik teknologi pendidikan?",
  "Bagaimana cara menulis justifikasi include/exclude yang baik?",
];

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toShortHistory(messages: ChatMessage[]): Array<{ role: ChatRole; content: string }> {
  return messages.slice(-12).map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-2 text-base font-bold leading-snug first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-2 text-[15px] font-bold leading-snug first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 text-sm font-bold leading-snug first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="whitespace-pre-wrap leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="rounded-xl border-l-2 border-cyan-400/70 bg-cyan-100/40 px-3 py-2 text-[13px] dark:bg-cyan-900/25">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-cyan-700 underline underline-offset-4 dark:text-cyan-300"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-xl border border-cyan-200/70 dark:border-cyan-500/35">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-cyan-100/80 dark:bg-cyan-900/35">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-cyan-200/70 px-2 py-1 text-left font-semibold dark:border-cyan-500/30">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-cyan-200/70 px-2 py-1 align-top dark:border-cyan-500/30">
              {children}
            </td>
          ),
          code: ({ children }) => (
            <code className="rounded-md bg-cyan-100/70 px-1.5 py-0.5 text-[12px] dark:bg-cyan-900/45">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-xl border border-cyan-200/70 bg-cyan-50/80 p-2 text-xs dark:border-cyan-500/30 dark:bg-slate-950/70">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-3 border-cyan-300/70 dark:border-cyan-500/35" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function FloatingAiChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const messagesRef = useRef(messages);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    setIsHydrated(true);

    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;

      if (!Array.isArray(parsed)) {
        return;
      }

      const restored = parsed
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const record = item as Record<string, unknown>;
          const role = record.role === "assistant" ? "assistant" : "user";
          const content = typeof record.content === "string" ? record.content : "";
          const id = typeof record.id === "string" ? record.id : createId();
          const createdAt =
            typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
              ? record.createdAt
              : Date.now();

          if (content.trim().length === 0) {
            return null;
          }

          return {
            id,
            role,
            content,
            createdAt,
          } satisfies ChatMessage;
        })
        .filter((item): item is ChatMessage => item !== null)
        .slice(-40);

      setMessages(restored);
    } catch {
      // Ignore localStorage parse issue.
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      // Ignore localStorage write issue.
    }
  }, [isHydrated, messages]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const container = scrollRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isOpen, isStreaming]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const canSend = useMemo(() => {
    return input.trim().length > 0 && !isStreaming;
  }, [input, isStreaming]);

  function stopStreaming() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }

  function clearChat() {
    if (isStreaming) {
      return;
    }

    setMessages([]);
    setErrorMessage("");
  }

  async function sendMessage(rawText: string) {
    const userText = rawText.trim();

    if (userText.length === 0 || isStreaming) {
      return;
    }

    setErrorMessage("");
    setInput("");

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: userText,
      createdAt: Date.now(),
    };

    const assistantMessageId = createId();
    const historyForRequest = toShortHistory([...messagesRef.current, userMessage]);

    setMessages((previousMessages) => [
      ...previousMessages,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: Date.now(),
      },
    ]);

    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userText,
          history: historyForRequest,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Gagal menghubungi AI.");
      }

      if (!response.body) {
        throw new Error("Response stream tidak tersedia.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        const chunk = decoder.decode(value, {
          stream: true,
        });

        if (!chunk) {
          continue;
        }

        fullText += chunk;

        setMessages((previousMessages) =>
          previousMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                ...message,
                content: fullText,
              }
              : message,
          ),
        );
      }

      if (fullText.trim().length === 0) {
        setMessages((previousMessages) =>
          previousMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                ...message,
                content:
                  "Maaf, belum ada jawaban yang bisa saya berikan. Silakan coba pertanyaan lain.",
              }
              : message,
          ),
        );
      }
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") {
        setMessages((previousMessages) =>
          previousMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                ...message,
                content:
                  message.content.trim().length > 0
                    ? message.content
                    : "Streaming dihentikan.",
              }
              : message,
          ),
        );
      } else {
        const message =
          error instanceof Error ? error.message : "Terjadi error saat meminta jawaban AI.";
        setErrorMessage(message);

        setMessages((previousMessages) =>
          previousMessages.map((chatMessage) =>
            chatMessage.id === assistantMessageId
              ? {
                ...chatMessage,
                content:
                  "Maaf, terjadi kendala saat memproses jawaban. Silakan kirim ulang pertanyaan.",
              }
              : chatMessage,
          ),
        );
      }
    } finally {
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  if (!isHydrated) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {isOpen ? (
          <motion.aside
            key="floating-ai-chat-window"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-4 z-[75] h-[74vh] w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-3xl border border-slate-200/80 bg-white/78 shadow-[0_18px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/72 dark:border-white/10 dark:bg-slate-900/78"
          >
            <div className="relative flex h-full flex-col">
              <header className="relative z-10 flex items-center justify-between border-b border-slate-200/75 px-4 py-3 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-700 dark:bg-cyan-400/20 dark:text-cyan-200">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-tight">AI SLR Assistant</p>
                    <p className="text-[11px] text-muted-foreground">
                      Model: openai/gpt-oss-120b
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={clearChat}
                    disabled={isStreaming || messages.length === 0}
                    title="Bersihkan chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setIsOpen(false)}
                    title="Tutup"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </header>

              <div ref={scrollRef} className="relative z-10 flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 text-sm dark:border-white/10 dark:bg-slate-900/70">
                      <p className="font-semibold">Halo, saya siap bantu screening Anda.</p>
                      <p className="mt-1 text-muted-foreground">
                        Saya fokus pada aplikasi ini, SLR, paper ilmiah, dan database knowledge.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void sendMessage(prompt)}
                          className="rounded-full border border-slate-300/80 bg-white/85 px-3 py-1.5 text-left text-xs text-slate-800 transition hover:bg-slate-100 dark:border-white/15 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
                          disabled={isStreaming}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {messages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                          isUser
                            ? "bg-cyan-600 text-white"
                            : "border border-slate-200/75 bg-white/88 text-foreground dark:border-white/10 dark:bg-slate-900/78"
                        }`}
                      >
                        {!isUser ? (
                          <p className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-cyan-700/85 dark:text-cyan-300/90">
                            <Bot className="h-3 w-3" />
                            Assistant
                          </p>
                        ) : null}
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                          <AssistantMarkdown content={message.content} />
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {isStreaming ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    AI sedang mengetik...
                  </div>
                ) : null}
              </div>

              <footer className="relative z-10 border-t border-slate-200/75 bg-white/55 px-3 py-3 backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/55">
                {errorMessage ? (
                  <p className="mb-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                    {errorMessage}
                  </p>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-2">
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ketik pertanyaan Anda... (Enter untuk kirim)"
                    className="max-h-28 min-h-16 resize-none rounded-2xl border-slate-300/80 bg-white/90 text-sm shadow-sm dark:border-white/10 dark:bg-slate-900/85"
                    disabled={isStreaming}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Shift+Enter untuk baris baru.
                    </p>

                    <div className="flex items-center gap-2">
                      {isStreaming ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={stopStreaming}
                          className="gap-1.5 rounded-full"
                        >
                          <Square className="h-3.5 w-3.5" />
                          Stop
                        </Button>
                      ) : null}

                      <Button
                        type="submit"
                        size="sm"
                        disabled={!canSend}
                        className="gap-1.5 rounded-full bg-cyan-600 hover:bg-cyan-700"
                      >
                        <SendHorizonal className="h-3.5 w-3.5" />
                        Kirim
                      </Button>
                    </div>
                  </div>
                </form>
              </footer>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <motion.div
        className="fixed bottom-6 right-4 z-[74]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Button
          type="button"
          onClick={() => setIsOpen((previousState) => !previousState)}
          className="group relative h-14 w-14 rounded-full border border-cyan-200/70 bg-linear-to-br from-cyan-500 to-sky-600 p-0 shadow-[0_12px_30px_rgba(14,116,144,0.35)] hover:from-cyan-600 hover:to-sky-700 dark:border-cyan-400/30"
          title="Buka AI Assistant"
        >
          <span className="absolute inset-0 rounded-full bg-white/20 opacity-0 transition group-hover:opacity-100" />
          <Sparkles className="relative z-10 h-6 w-6 text-white" />
        </Button>
      </motion.div>
    </>
  );
}
