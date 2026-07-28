import Image from "next/image";
import { ArrowRightIcon, ButtonLink } from "@/components/ui/Button";
import Divider from "@/components/ui/Divider";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ivory px-6 py-8 text-center [@media(max-height:520px)]:gap-3 [@media(max-height:520px)]:py-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brass lg:text-sm">
          Canadian Pacific · Trans-Pacific
        </p>
        {/* Type scales on lg (not sm): a landscape phone is wide enough for sm
            but far too short for 6xl — height is the real constraint here. */}
        <h1 className="font-display text-4xl font-bold tracking-tight text-navy lg:text-6xl">
          <span className="mb-1 block text-2xl font-semibold italic tracking-normal text-brass lg:mb-1.5 lg:text-4xl [@media(max-height:520px)]:mb-0.5 [@media(max-height:520px)]:text-2xl">
            Echoes of 
          </span>
          The Empress of Japan
        </h1>
        <p className="mx-auto max-w-xl text-sm text-navy-soft lg:text-base">
          Immersive experience designed for Vancouver Maritime Museum visitors
        </p>
      </div>

      <Divider />

      {/* Poster scales to the viewport height so the page stays on one screen
          when it can (min-h-dvh lets very short viewports scroll instead);
          capped at the image's native 640px to stay crisp. */}

        <Image
          src="/home.jpg"
          alt="Canadian Pacific poster for the R.M.S. Empress of Japan, the Pacific Empress"
          width={640}
          height={329}
          priority
          sizes="(min-width: 768px) 640px, 90vw"
          className="max-h-[42vh] w-auto max-w-[min(88vw,640px)] rounded-sm [@media(max-height:520px)]:max-h-[32vh]"
        />
       <Divider />

      <ButtonLink href="/explore">
        Step Aboard
      </ButtonLink>
    </main>
  );
}
