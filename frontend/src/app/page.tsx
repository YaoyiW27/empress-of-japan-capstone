import Image from "next/image";
import { ButtonLink } from "@/components/ui/Button";
import Divider from "@/components/ui/Divider";

export default function Home() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-5 overflow-hidden bg-ivory px-6 py-8 text-center">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brass sm:text-sm">
          Canadian Pacific · Trans-Pacific
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-navy sm:text-6xl">
          Empress of Japan
        </h1>
        <p className="mx-auto max-w-xl text-base text-navy-soft sm:text-lg">
          A Web XR experience for the Vancouver Maritime Museum.
        </p>
      </div>

      <Divider />

      {/* Poster scales to the viewport height so the page stays on one screen;
          capped at the image's native 640px to stay crisp. */}
      <div className="rounded-md border border-brass/60 bg-card p-2 shadow-xl ring-1 ring-brass/20">
        <Image
          src="/home.jpg"
          alt="Canadian Pacific poster for the R.M.S. Empress of Japan, the Pacific Empress"
          width={640}
          height={329}
          priority
          sizes="(min-width: 768px) 640px, 90vw"
          className="max-h-[42vh] w-auto max-w-[min(88vw,640px)] rounded-sm"
        />
      </div>

      <ButtonLink href="/explore">Step aboard →</ButtonLink>
    </main>
  );
}
