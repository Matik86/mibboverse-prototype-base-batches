import ReactMarkdown from "react-markdown";
import {
  useSendTransaction,
  useSwitchActiveWalletChain,
  useActiveAccount,
} from "thirdweb/react";
import { defineChain } from "thirdweb/chains";
import { client } from "./client";
import { useState } from "react";

function TransactionCard({ data }) {
  const { mutate: sendTransaction, isPending } = useSendTransaction();
  const switchChain = useSwitchActiveWalletChain();
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  let tx;
  try {
    tx = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return (
      <div className="my-3 p-3 rounded-xl bg-red-900/30 border border-red-500/20">
        <p className="text-red-400 text-xs font-mono">
          Invalid transaction JSON
        </p>
      </div>
    );
  }

  const handleSend = async () => {
    setError(null);
    setTxHash(null);
    const targetChain = defineChain(tx.tx.chainId ?? 8453);
    try {
      await switchChain(targetChain);
    } catch (e) {
      console.warn("switchChain failed:", e);
    }
    sendTransaction(
      {
        ...tx.tx,
        value: BigInt(tx.tx.value ?? "0"),
        chain: targetChain,
        client,
      },
      {
        onSuccess: (result) => setTxHash(result.transactionHash),
        onError: (e) => setError(e.message ?? "Transaction failed"),
      },
    );
  };

  return (
    <div className="my-3 rounded-2xl bg-white/[0.06] border border-white/10 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] leading-tight text-[#f0ede8] truncate">
            {tx.title}
          </div>
          <div className="text-[11px] text-white/40 truncate mt-0.5">
            {tx.description}
          </div>
        </div>
        <button
          onClick={handleSend}
          disabled={isPending}
          className="flex-shrink-0 px-4 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all text-white text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Sending..." : "Open"}
        </button>
      </div>

      {txHash && (
        <div className="px-4 py-2 border-t border-white/[0.06] text-[11px] text-emerald-400 font-mono break-all">
          ✓ {txHash}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 border-t border-white/[0.06] text-[11px] text-red-400 break-all">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

function SignatureCard({ data }) {
  const account = useActiveAccount();
  const [isPending, setIsPending] = useState(false);
  const [signature, setSignature] = useState(null);
  const [error, setError] = useState(null);

  let sig;
  try {
    sig = typeof data === "string" ? JSON.parse(data) : data;
  } catch {
    return (
      <div className="my-3 p-3 rounded-xl bg-red-900/30 border border-red-500/20">
        <p className="text-red-400 text-xs font-mono">Invalid signature JSON</p>
      </div>
    );
  }

  const handleSign = async () => {
    if (!account) return;
    setIsPending(true);
    setError(null);
    setSignature(null);
    try {
      const result = await account.signTypedData(sig.payload);
      setSignature(result);
    } catch (e) {
      console.error("signTypedData failed:", e);
      setError(e.message ?? "Signing failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="my-3 rounded-2xl bg-white/[0.06] border border-white/10 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px] leading-tight text-[#f0ede8] truncate">
            {sig.title}
          </div>
          <div className="text-[11px] text-white/40 truncate mt-0.5">
            {sig.description}
          </div>
        </div>
        <button
          onClick={handleSign}
          disabled={isPending || !account || !!signature}
          className="flex-shrink-0 px-4 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 active:scale-95 transition-all text-white text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Signing..." : signature ? "Signed ✓" : "Sign"}
        </button>
      </div>

      {signature && (
        <div
          className="px-4 py-2 border-t border-white/[0.06] text-[11px] text-emerald-400 font-mono break-all cursor-pointer"
          onClick={() => navigator.clipboard.writeText(signature)}
          title="Click to copy"
        >
          ✓ {signature}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 border-t border-white/[0.06] text-[11px] text-red-400 break-all">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

const md = {
  p({ children }) {
    return <p style={{ margin: "0 0 8px 0", lineHeight: 1.6 }}>{children}</p>;
  },
  h1({ children }) {
    return (
      <h1
        style={{
          fontSize: 20,
          fontWeight: 700,
          margin: "12px 0 6px",
          lineHeight: 1.3,
        }}
      >
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2
        style={{
          fontSize: 17,
          fontWeight: 700,
          margin: "10px 0 5px",
          lineHeight: 1.3,
        }}
      >
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          margin: "8px 0 4px",
          lineHeight: 1.3,
        }}
      >
        {children}
      </h3>
    );
  },
  ul({ children }) {
    return (
      <ul
        style={{
          margin: "4px 0 8px 0",
          paddingLeft: 18,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol
        style={{
          margin: "4px 0 8px 0",
          paddingLeft: 20,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li style={{ lineHeight: 1.55, fontSize: 15 }}>{children}</li>;
  },
  strong({ children }) {
    return <strong style={{ fontWeight: 700 }}>{children}</strong>;
  },
  em({ children }) {
    return <em style={{ fontStyle: "italic", opacity: 0.85 }}>{children}</em>;
  },
  blockquote({ children }) {
    return (
      <blockquote
        style={{
          borderLeft: "3px solid rgba(99,102,241,0.6)",
          paddingLeft: 12,
          margin: "6px 0",
          opacity: 0.8,
          fontStyle: "italic",
        }}
      >
        {children}
      </blockquote>
    );
  },
  hr() {
    return (
      <hr
        style={{
          border: "none",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          margin: "10px 0",
        }}
      />
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "#818cf8",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        {children}
      </a>
    );
  },
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className || "");
    const lang = match ? match[1] : "";
    const content = String(children).replace(/\n$/, "");

    if (lang === "transaction") {
      try {
        return <TransactionCard data={JSON.parse(content)} />;
      } catch {
        return (
          <div className="my-3 p-3 rounded-xl bg-red-900/30 border border-red-500/20">
            <p className="text-red-400 text-xs font-mono">
              Invalid transaction JSON
            </p>
          </div>
        );
      }
    }

    if (lang === "signature") {
      try {
        return <SignatureCard data={JSON.parse(content)} />;
      } catch {
        return (
          <div className="my-3 p-3 rounded-xl bg-red-900/30 border border-red-500/20">
            <p className="text-red-400 text-xs font-mono">
              Invalid signature JSON
            </p>
          </div>
        );
      }
    }

    if (!lang) {
      return (
        <code
          style={{
            background: "rgba(255,255,255,0.1)",
            borderRadius: 5,
            padding: "1px 6px",
            fontSize: "0.88em",
            fontFamily: "monospace",
          }}
        >
          {children}
        </code>
      );
    }

    return (
      <code
        style={{
          display: "block",
          background: "rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 13,
          fontFamily: "monospace",
          overflowX: "auto",
          whiteSpace: "pre",
          margin: "6px 0",
          lineHeight: 1.6,
        }}
      >
        {content}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
};

export default function FormatedMessage({ children }) {
  return (
    <div style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
      <ReactMarkdown components={md}>{children || ""}</ReactMarkdown>
    </div>
  );
}
