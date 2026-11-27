import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { HeroVideo } from "./hero-video";

// Static landing page in the "Gift tags" look (docs/design/gift-tags.md). The tool itself lives at /try.

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
            <Link href="/try" className={`${pill} bg-[#0b0b0c] text-white`}>
              Try it
            </Link>
            <a href="#film" className={`${pill} bg-white`}>
              Watch the film
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
          <p className="max-w-xl text-[#5f5f66]">The second film, on the paradox of surprise, and three short ad clips.</p>
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
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            { src: 'ad-problem', label: 'Stop guessing' },
            { src: 'ad-agent', label: 'Drop anything in' },
            { src: 'ad-moment', label: 'The moment it lands' },
          ].map((v) => (
            <figure key={v.src} className="flex flex-col gap-2">
              <video className="w-full rounded-[28px] border-2 border-[#0b0b0c] bg-black" controls preload="metadata" playsInline poster={`/video/${v.src}.jpg`}>
                <source src={`/video/${v.src}.mp4`} type="video/mp4" />
              </video>
              <figcaption className="font-mono text-xs uppercase tracking-widest text-[#5f5f66]">{v.label} · AI-generated clip</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="flex flex-col items-start gap-6 border-t-2 border-[#0b0b0c] pt-10">
        <h2 className="gt-display text-4xl tracking-tight sm:text-6xl">Who are you buying for?</h2>
        <Link href="/try" className={`${pill} bg-[#0b0b0c] text-white`}>
          Try it
        </Link>
        <footer className="gt-mono mt-6 normal-case">
          Built at the Agentic Hackathon Berlin with the idealo MCP and the Nebius Token Factory.
        </footer>
      </section>
    </div>
  );
}
