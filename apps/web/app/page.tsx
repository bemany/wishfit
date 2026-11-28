import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { HeroVideo } from "./hero-video";
import { UtmLinks } from "./utm-links";

// Static landing page in the "Gift tags" look (docs/design/gift-tags.md). The main call opens the web app (NEXT_PUBLIC_APP_URL); the older tool stays at /try.

// The installable web app; the deployment can point somewhere else with NEXT_PUBLIC_APP_URL
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wishfit-web-test.vercel.app";

const INSTALL = [
  {
    os: "iPhone · Safari",
    color: "bg-[#8fd3ff]",
    steps: ["Open Wishfit in Safari.", "Tap Share in the toolbar.", "Scroll down, tap “Add to Home Screen”.", "Tap Add."],
  },
  {
    os: "Android · Chrome",
    color: "bg-[#7fd6a8]",
    steps: ["Open Wishfit in Chrome.", "Tap “Install app” when Wishfit offers it, or open the ⋮ menu.", "Tap “Install app” or “Add to Home screen”.", "Confirm."],
  },
];

const STEPS = [
  { n: "1", color: "bg-[#ffd23f]", title: "Add someone", text: "Name, budget, occasion. That is the whole setup." },
  {
    n: "2",
    color: "bg-[#7fd6a8]",
    title: "Drop anything in",
    text: "A WhatsApp chat export, an Amazon wishlist link, your notes, or just dictate what you know.",
  },
  {
    n: "3",
    color: "bg-[#c9a7ff]",
    title: "Get one pick, keep chatting",
    text: "One gift, not a list. Not quite right? Say “Cheaper” or “Something else”.",
  },
];

const STAMPS = [
  { label: "Price history 30d", value: "−7.3 %", rotate: "-rotate-2" },
  { label: "Total", value: "€29.98 ≤ €60 budget", rotate: "rotate-1" },
  { label: "Compared", value: "15 offers", rotate: "-rotate-1" },
  { label: "Delivery", value: "by Tue 01.12.", rotate: "rotate-2" },
];

const SHOTS = [
  { src: "/app/01-people.png", alt: "App screen: your people as a stack of gift tags", caption: "Your people" },
  { src: "/app/07-cheaper.png", alt: "App screen: asking the agent for a cheaper pick", caption: "Keep chatting" },
  { src: "/app/06-detail.png", alt: "App screen: the pick in detail with idealo data", caption: "The pick, with receipts" },
];

function Tag({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`gt-tag ${className}`}>{children}</div>;
}

const pill = "inline-flex h-14 items-center rounded-full border-2 border-[#0b0b0c] px-8 text-lg font-semibold";

export default function LandingPage() {
  return (
    <div className="gt flex flex-col gap-20 pb-6 sm:gap-28">
      {/* The landing page is always white, whatever the system theme says. */}
      <style>{`html,body{background:#fff!important;color:#0b0b0c!important}`}</style>
      <UtmLinks />

      <section className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex flex-col items-start gap-6">
          <p className="gt-mono">{BRAND} · gift agent</p>
          <h1 className="gt-display text-[clamp(2.9rem,9vw,6rem)] leading-[0.92] tracking-tight text-balance">
            Drop anything in. Get the one gift that fits.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[#5f5f66] sm:text-xl">
            Give the agent a chat export, a wishlist link or your own words. It searches idealo live and picks one gift
            in your budget, with receipts.
          </p>
          <div className="flex flex-wrap gap-3">
            <a data-app-link href={APP_URL} className={`${pill} bg-[#0b0b0c] text-white`}>
              Open Wishfit
            </a>
            <a href="#film" className={`${pill} bg-white`}>
              Watch the film
            </a>
            <a data-app-link href={`${APP_URL}/install`} className={`${pill} bg-white`}>
              Add to home screen
            </a>
          </div>
        </div>

        <div className="mx-auto w-full max-w-sm pt-4">
          <Tag className="-rotate-3 bg-[#ff5a3c]">
            <p className="gt-display text-3xl">Mara</p>
            <p className="gt-mono mt-1">Birthday · €60</p>
          </Tag>
          <Tag className="-mt-3 ml-6 rotate-2 bg-[#8fd3ff]">
            <p className="gt-display text-3xl">Enes</p>
            <p className="gt-mono mt-1">Christmas · €50</p>
          </Tag>
          <Tag className="-mt-3 -rotate-1 bg-[#ffd23f]">
            <p className="gt-mono">The pick for Lea</p>
            <p className="gt-display mt-2 text-2xl leading-tight">Camelbak Podium Steel Bike Bottle 500ml</p>
            <p className="gt-display mt-3 text-6xl tracking-tight">€29.98</p>
            <p className="gt-mono mt-2">in budget · 15 offers compared</p>
          </Tag>
        </div>
      </section>

      <HeroVideo src="/video/brag.mp4" poster="/video/brag.jpg" />

      <section className="flex flex-col gap-6 rounded-[28px] border-2 border-[#0b0b0c] bg-[#ffd23f] p-6 sm:p-10">
        <p className="gt-mono">Built in one day at the Agentic Hackathon Berlin</p>
        <h2 className="gt-display text-3xl leading-tight tracking-tight sm:text-5xl">
          A native iPhone app, running on a real device today. Android-capable from the same codebase.
        </h2>
        <p className="max-w-3xl text-lg leading-relaxed">
          Wishfit is a working product, not a mockup: an iOS app built with React Native (Expo), installed on an iPhone
          and talking to a live agent. The agent runs on the Nebius Token Factory and researches every gift idea in real
          time through the idealo MCP. Because the app is React Native, the same code can ship to Android; the Android
          build is the next step.
        </p>
        <div className="flex flex-wrap gap-3">
          {["iOS app on device", "Android-capable codebase", "Live idealo data", "Agent on Nebius", "Reads chats and Amazon wishlists"].map((s) => (
            <span key={s} className="rounded-lg border-2 border-[#0b0b0c] bg-white px-3 py-2 font-mono text-xs uppercase tracking-widest">
              {s}
            </span>
          ))}
        </div>
        <p className="gt-display text-2xl sm:text-3xl">We would love to show it to you live.</p>
      </section>

      <section id="how" className="flex scroll-mt-8 flex-col gap-8">
        <h2 className="gt-display text-4xl tracking-tight sm:text-6xl">How it works</h2>
        <ol className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Tag className={`h-full ${s.color}`}>
                <p className="gt-display text-6xl">{s.n}</p>
                <h3 className="gt-display mt-3 text-2xl leading-tight">{s.title}</h3>
                <p className="mt-2 text-base leading-relaxed">{s.text}</p>
              </Tag>
            </li>
          ))}
        </ol>
      </section>

      <section id="install" className="flex scroll-mt-8 flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="gt-display text-4xl tracking-tight sm:text-6xl">Add to home screen</h2>
          <p className="max-w-xl text-lg text-[#5f5f66]">
            Wishfit runs in the browser and installs like an app: full screen, one tap away, no store.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {INSTALL.map((i) => (
            <Tag key={i.os} className={i.color}>
              <p className="gt-mono">{i.os}</p>
              <ol className="mt-3 flex flex-col gap-2 text-base leading-relaxed">
                {i.steps.map((st, n) => (
                  <li key={st} className="flex gap-3">
                    <span className="gt-display text-xl">{n + 1}</span>
                    <span>{st}</span>
                  </li>
                ))}
              </ol>
            </Tag>
          ))}
        </div>
        <a data-app-link href={APP_URL} className={`${pill} self-start bg-[#0b0b0c] text-white`}>
          Open Wishfit
        </a>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="gt-display text-4xl tracking-tight sm:text-6xl">With receipts</h2>
          <p className="max-w-xl text-lg text-[#5f5f66]">Every pick shows the idealo data it is based on.</p>
        </div>
        <ul className="flex flex-wrap gap-4 sm:gap-6">
          {STAMPS.map((s) => (
            <li key={s.label} className={`rounded-lg border-2 border-[#0b0b0c] bg-white px-4 py-3 ${s.rotate}`}>
              <p className="gt-mono">{s.label}</p>
              <p className="gt-display mt-1 text-2xl sm:text-3xl">{s.value}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="gt-display text-4xl tracking-tight sm:text-6xl">The app</h2>
          <p className="max-w-xl text-lg text-[#5f5f66]">
            Real screenshots from the iPhone build running in the simulator. Same agent, same idealo data.
          </p>
        </div>
        <ul className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {SHOTS.map((s) => (
            <li key={s.src} className="mx-auto flex w-full max-w-[280px] flex-col gap-3">
              <div className="overflow-hidden rounded-[36px] border-2 border-[#0b0b0c] bg-white">
                <Image src={s.src} alt={s.alt} width={1206} height={2622} sizes="280px" className="h-auto w-full" />
              </div>
              <p className="gt-mono text-center">{s.caption}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h2 className="gt-display text-4xl tracking-tight sm:text-6xl">Watch</h2>
          <p className="max-w-xl text-[#5f5f66]">The second film, on the paradox of surprise.</p>
        </div>
        <div className="grid gap-6">
          {[
            { src: 'paradox', label: 'The paradox of surprise' },
          ].map((v) => (
            <figure key={v.src} className="flex flex-col gap-2">
              <video className="w-full rounded-[28px] border-2 border-[#0b0b0c] bg-black" controls preload="metadata" playsInline poster={`/video/${v.src}.jpg`}>
                <source src={`/video/${v.src}.mp4`} type="video/mp4" />
              </video>
              <figcaption className="font-mono text-xs uppercase tracking-widest text-[#5f5f66]">{v.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start gap-6 border-t-2 border-[#0b0b0c] pt-10">
        <h2 className="gt-display text-4xl tracking-tight sm:text-6xl">Who are you buying for?</h2>
        <div className="flex flex-wrap gap-3">
          <a data-app-link href={APP_URL} className={`${pill} bg-[#0b0b0c] text-white`}>
            Open Wishfit
          </a>
          <a href="#film" className={`${pill} bg-white`}>
            Watch the film
          </a>
        </div>
        <footer className="gt-mono mt-6 normal-case">
          Built at the Agentic Hackathon Berlin with the idealo MCP and the Nebius Token Factory.
        </footer>
      </section>
    </div>
  );
}
