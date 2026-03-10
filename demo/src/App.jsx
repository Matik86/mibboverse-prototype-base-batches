import { useState, useRef, useEffect } from "react";
import FormatedMessage from "./FormatedMessage";
import useAgent from "./agent";
import { ConnectButton } from "thirdweb/react";
import { createWallet, walletConnect } from "thirdweb/wallets";
import { client } from "./client";
import { useChatStore } from "./store";
import * as allChains from "thirdweb/chains";
import { base } from "thirdweb/chains";

const SUPPORTED_CHAINS = [
  base,
  ...Object.values(allChains).filter(
    (c) => c && typeof c === "object" && "id" in c,
  ),
];
const wallets = [
  walletConnect({
    chains: SUPPORTED_CHAINS,
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("com.trustwallet.app"),
  createWallet("app.phantom"),
  createWallet("com.okex.wallet"),
  createWallet("io.zerion.wallet"),
  createWallet("org.uniswap"),
];

const AGENTS = [
  // demo
  {
    id: "12345",
    name: "delirium (Degen)",
    emoji: "🌟",
    desc: "High-risk plays, memecoins, and volatile momentum trades",
  },
  {
    id: "123456",
    name: "silhouette (Researcher)",
    emoji: "🔎",
    desc: "Deep dives into on-chain data, wallets, and protocol fundamentals",
  },
  {
    id: "1234567",
    name: "mtv (Alpha trader)",
    emoji: "📈",
    desc: "Scans liquidity shifts, insider wallets, and early breakout signals",
  },
];

export default function App() {
  const [input, setInput] = useState("");
  const [agentId, setAgentId] = useState(AGENTS[0].id);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inputMultiline, setInputMultiline] = useState(false);
  const [network, setNetwork] = useState("base");
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef(null);

  const NETWORKS = [
    { id: "base", label: "Base", icon: "🔵" },
    { id: "avax", label: "Avax", icon: "🔴" },
  ];
  const selectedNetwork = NETWORKS.find((n) => n.id === network) || NETWORKS[0];
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
    setInputMultiline(el.scrollHeight > 50);
  }, [input]);

  const selectedAgent = AGENTS.find((a) => a.id === agentId) || AGENTS[0];
  const { messages, status, isPending, sendMessage } = useAgent(agentId);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
      if (
        networkDropdownRef.current &&
        !networkDropdownRef.current.contains(e.target)
      )
        setNetworkDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSend = async () => {
    if (!input) return;
    const msg = input;
    setInput("");
    await sendMessage(msg, network);
  };

  const isButtonDisabled =
    status !== "idle" || isPending || !input || agentId.length !== 16;
  const isIdle = status === "idle";

  return (
    <div className="h-[100dvh] w-full bg-[#0f0f10] text-[#f0ede8] flex flex-col items-center overflow-hidden [&_*]:[-webkit-tap-highlight-color:transparent]">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dropIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .animate-fadeUp { animation: fadeUp 0.25s ease; }
        .animate-dropIn { animation: dropIn 0.15s ease; }
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Inner container — full height, max width on desktop */}
      <div className="w-full max-w-[800px] h-full flex flex-col">
        {/* Header: agent selector + connect button */}
        <div
          ref={dropdownRef}
          className="relative z-20 flex-shrink-0 flex items-center gap-2 px-3 py-3 border-b border-white/[0.06] bg-[rgba(15,15,16,0.95)] backdrop-blur-xl"
        >
          {/* Agent selector */}
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2 rounded-2xl bg-white/[0.06] border border-white/10 text-left cursor-pointer"
          >
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-base flex-shrink-0">
              {selectedAgent.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[15px] leading-tight tracking-tight">
                {selectedAgent.name}
              </div>
              <div className="text-[11px] text-white/40 truncate mt-0.5">
                {selectedAgent.desc}
              </div>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className={`flex-shrink-0 opacity-50 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Connect button */}
          <div className="flex-shrink-0">
            <ConnectButton
              client={client}
              wallets={wallets}
              chains={SUPPORTED_CHAINS}
              theme="dark"
              connectButton={{
                label: "Connect",
                style: {
                  background: "rgba(99,102,241,0.15)",
                  border: "1px solid rgba(99,102,241,0.3)",
                  color: "#a5b4fc",
                  borderRadius: "14px",
                  fontSize: "13px",
                  fontWeight: "600",
                  padding: "8px 14px",
                  height: "55px",
                  whiteSpace: "nowrap",
                },
              }}
              detailsButton={{
                style: {
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#f0ede8",
                  borderRadius: "14px",
                  fontSize: "13px",
                  fontWeight: "600",
                  padding: "8px 14px",
                  height: "55px",
                },
              }}
            />
          </div>

          {dropdownOpen && (
            <div className="animate-dropIn absolute top-[calc(100%-4px)] left-3 right-3 bg-[#1a1a1c] border border-white/10 rounded-2xl overflow-hidden z-30 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              {AGENTS.map((agent, i) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setAgentId(agent.id);
                    useChatStore.setState({ messages: [] });
                    setDropdownOpen(false);
                  }}
                  className={`flex items-center gap-3 w-full px-3.5 py-3 text-left cursor-pointer
                    ${agent.id === agentId ? "bg-indigo-500/15" : "bg-transparent hover:bg-white/5"}
                    ${i < AGENTS.length - 1 ? "border-b border-white/[0.05]" : ""}`}
                >
                  <div
                    className={`w-[34px] h-[34px] rounded-full flex items-center justify-center text-base flex-shrink-0
                    ${agent.id === agentId ? "bg-gradient-to-br from-indigo-500 to-violet-500" : "bg-white/[0.08]"}`}
                  >
                    {agent.emoji}
                  </div>
                  <span
                    className={`text-[15px] ${agent.id === agentId ? "font-semibold" : "font-normal"}`}
                  >
                    {agent.name}
                  </span>
                  {agent.id === agentId && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="ml-auto flex-shrink-0"
                    >
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="#818cf8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 flex flex-col gap-2.5 [scrollbar-width:none]">
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-30 py-10">
              <span className="text-4xl">{selectedAgent.emoji}</span>
              <span className="text-sm text-center leading-relaxed">
                Send a message to get started
              </span>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex animate-fadeUp ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role !== "user" && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-[13px] flex-shrink-0 self-end mr-2 mb-0.5">
                  {selectedAgent.emoji}
                </div>
              )}

              <div
                className={`max-w-[78%] px-[15px] py-3 text-[15px] leading-[1.55]
                ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-indigo-500 to-indigo-400 shadow-[0_4px_15px_rgba(99,102,241,0.3)] rounded-[20px_20px_6px_20px]"
                    : "bg-white/[0.07] border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.2)] rounded-[20px_20px_20px_6px]"
                }`}
              >
                {msg.role === "user" ? (
                  <p className="m-0">{msg.content}</p>
                ) : (
                  <>
                    {idx === messages.length - 1 && status === "thinking" && (
                      <div className="flex items-center gap-1.5 text-indigo-300 text-xs mb-2">
                        <span className="w-2.5 h-2.5 border-2 border-indigo-300 border-t-transparent rounded-full inline-block animate-spin" />
                        Hmm…
                      </div>
                    )}

                    <FormatedMessage>{msg.content}</FormatedMessage>

                    {msg.charged !== null && msg.remaining !== null && (
                      <div className="flex gap-3.5 mt-2.5 pt-2 border-t border-white/[0.08] text-[11px] text-emerald-300">
                        <span>Charged: {Number(msg.charged).toFixed(3)}</span>
                        <span className="text-emerald-300/60">
                          {Number(msg.remaining).toFixed(3)} / 0.100
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-shrink-0 px-3 pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] border-t border-white/[0.06] bg-[rgba(15,15,16,0.95)] backdrop-blur-xl">
          <div
            className="flex items-end gap-2 pl-4 pr-1.5 bg-white/[0.07] border border-white/10"
            style={{
              minHeight: "50px",
              borderRadius: inputMultiline ? "20px" : "9999px",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={async (e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isButtonDisabled) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message..."
              rows={1}
              style={{ resize: "none", height: "22px" }}
              className="flex-1 bg-transparent border-none outline-none text-[#f0ede8] text-[15px] placeholder:text-white/30 caret-indigo-400 leading-[22px] py-[14px] overflow-hidden"
            />

            {/* Network selector */}
            <div
              ref={networkDropdownRef}
              className="relative flex-shrink-0 self-end mb-[8px]"
            >
              <button
                onClick={() => setNetworkDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/[0.08] border border-white/[0.10] hover:bg-white/[0.12] transition-colors duration-150 cursor-pointer"
              >
                <span className="text-[13px]">{selectedNetwork.icon}</span>
                <span className="text-[12px] font-semibold text-white/70 leading-none">
                  {selectedNetwork.label}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`opacity-40 transition-transform duration-150 ${networkDropdownOpen ? "rotate-180" : ""}`}
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              {networkDropdownOpen && (
                <div className="animate-dropIn absolute bottom-[calc(100%+6px)] right-0 bg-[#1a1a1c] border border-white/10 rounded-xl overflow-hidden z-30 shadow-[0_8px_24px_rgba(0,0,0,0.5)] min-w-[90px]">
                  {NETWORKS.map((net, i) => (
                    <button
                      key={net.id}
                      onClick={() => {
                        setNetwork(net.id);
                        setNetworkDropdownOpen(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-2.5 text-left cursor-pointer
                        ${net.id === network ? "bg-indigo-500/15" : "bg-transparent hover:bg-white/5"}
                        ${i < NETWORKS.length - 1 ? "border-b border-white/[0.05]" : ""}`}
                    >
                      <span className="text-[13px]">{net.icon}</span>
                      <span
                        className={`text-[13px] ${net.id === network ? "font-semibold text-white" : "text-white/60"}`}
                      >
                        {net.label}
                      </span>
                      {net.id === network && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          className="ml-auto flex-shrink-0"
                        >
                          <path
                            d="M5 13l4 4L19 7"
                            stroke="#818cf8"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={isButtonDisabled}
              style={{ marginBottom: "6px" }}
              className={`w-[38px] h-[38px] rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200
                ${
                  isButtonDisabled
                    ? "bg-white/[0.08] cursor-not-allowed"
                    : "bg-gradient-to-br from-indigo-500 to-indigo-400 shadow-[0_4px_12px_rgba(99,102,241,0.4)] cursor-pointer"
                }`}
            >
              {!isIdle ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="animate-spin"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="3"
                  />
                  <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    stroke={
                      isButtonDisabled ? "rgba(255,255,255,0.3)" : "white"
                    }
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
