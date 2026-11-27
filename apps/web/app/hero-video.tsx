"use client";

import { useRef, useState } from "react";

// Main film in the hero: poster with one large play button; controls appear once it plays.
export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const play = () => {
    setStarted(true);
    ref.current?.play();
  };
  return (
    <div id="film" className="relative scroll-mt-8 overflow-hidden rounded-[28px] border-2 border-[#0b0b0c] bg-black">
      <video ref={ref} className="block aspect-video w-full" controls={started} preload="metadata" playsInline poster={poster} onPlay={() => setStarted(true)}>
        <source src={src} type="video/mp4" />
      </video>
      {!started && (
        <button
          type="button"
          onClick={play}
          aria-label="Play the film"
          className="group absolute inset-0 flex items-center justify-center bg-black/10 transition hover:bg-black/20 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-[-8px] focus-visible:outline-[#ffd23f]"
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-[#0b0b0c] bg-[#ffd23f] transition group-hover:scale-110 sm:h-32 sm:w-32">
            <svg viewBox="0 0 24 24" className="ml-1.5 h-10 w-10 fill-[#0b0b0c] sm:h-14 sm:w-14" aria-hidden="true">
              <path d="M6 4l14 8-14 8z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
