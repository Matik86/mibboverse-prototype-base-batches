import { useState } from "react";
import {
  useFetchWithPayment,
  useSwitchActiveWalletChain,
} from "thirdweb/react";
import { base } from "thirdweb/chains";
import { useChatStore } from "./store";
import { client } from "./client";

export default function useAgent(agentId) {
  const messages = useChatStore((state) => state.messages);
  const [status, setStatus] = useState("idle"); // idle | thinking | settling

  const switchChain = useSwitchActiveWalletChain();

  const { fetchWithPayment, isPending } = useFetchWithPayment(client, {
    parseAs: "raw",
    x402Version: 2,
  });

  const sendMessage = async (userMessage, preferredAsset) => {
    if (
      !userMessage ||
      !agentId ||
      agentId.length !== 16 ||
      status !== "idle"
    ) {
      return;
    }

    useChatStore.setState((state) => ({
      messages: [
        ...state.messages,
        { role: "user", content: userMessage },
        { role: "assistant", content: "", charged: null, remaining: null },
      ],
    }));

    setStatus("thinking");

    try {
      try {
        await switchChain(base);
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        console.warn("switchChain to base failed:", e);
      }

      const response = await fetchWithPayment(
        "https://app.mibboverse.com" + `/api/v2/agent/${agentId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            preferredAsset: preferredAsset,
          }),
        },
        { raw: true },
      );

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const blocks = chunk.split("\n\n");

        for (let block of blocks) {
          if (!block.trim()) continue;

          let payload;
          try {
            const dataLine = block
              .split("\n")
              .find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            payload = JSON.parse(dataLine.substring(6));
          } catch (e) {
            console.error("Failed to parse SSE block:", e);
            continue;
          }

          if (payload.type === "started") {
            setStatus("thinking");
          } else if (payload.type === "delta") {
            useChatStore.setState((state) => {
              const last = state.messages[state.messages.length - 1];
              return {
                messages: [
                  ...state.messages.slice(0, -1),
                  { ...last, content: last.content + payload.value },
                ],
              };
            });
          } else if (payload.type === "finished") {
            useChatStore.setState((state) => {
              const last = state.messages[state.messages.length - 1];
              return {
                messages: [
                  ...state.messages.slice(0, -1),
                  {
                    ...last,
                    charged: payload.charged ?? null,
                    remaining: payload.remaining ?? null,
                  },
                ],
              };
            });
            setStatus("settling");
          } else if (payload.type === "confirmed") {
            setStatus("idle");
          }
        }
      }
    } catch (err) {
      console.error("Streaming error:", err);
      useChatStore.setState((state) => {
        const last = state.messages[state.messages.length - 1];
        return {
          messages: [
            ...state.messages.slice(0, -1),
            {
              ...last,
              content: last.content + "\n\n⚠️ Error: " + err.message,
            },
          ],
        };
      });
      setStatus("idle");
    }
  };

  const clearMessages = () => {
    useChatStore.setState({ messages: [] });
    setStatus("idle");
  };

  return {
    messages,
    status,
    isPending,
    sendMessage,
    clearMessages,
  };
}
