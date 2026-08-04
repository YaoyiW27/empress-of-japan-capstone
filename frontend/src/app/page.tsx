import Image from "next/image";
import { ArrowRightIcon, ButtonLink } from "@/components/ui/Button";
import Divider from "@/components/ui/Divider";

export default function Home() {
  return (
    // The max(…, env(safe-area-inset-*)) paddings keep the header and CTA
    // clear of the notch / home indicator / standalone status bar now that
    // viewport-fit=cover lets the page extend under them.
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ivory pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-center short:gap-2 short:pt-[max(1rem,env(safe-area-inset-top))] short:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="space-y-3 lg:space-y-4 short:space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-navy-soft lg:text-sm">
          Canadian Pacific · Trans-Pacific
        </p>
        {/* Type scales on lg (not sm): a landscape phone is wide enough for sm
            but far too short for 6xl — height is the real constraint here.
            Poster-style two-liner: the italic lead-in stays inside the h1 so
            the document title reads as the full phrase. */}
        <h1 className="font-display text-4xl font-bold tracking-tight text-navy lg:text-6xl">
          <span className="mb-1 block text-3xl font-semibold italic tracking-normal text-brass lg:mb-1.5 lg:text-4xl [@media(max-height:520px)]:mb-0.5 [@media(max-height:520px)]:text-2xl">
            Echoes of 
          </span>
          The Empress of Japan
        </h1>
        <p className="mx-auto max-w-xl text-sm text-navy-soft lg:text-base">
          A browser-based experience designed for the Vancouver Maritime Museum: Empress of Japan
        </p>
      </div>

      {/* Dropped on short phone-landscape: the fixed text/CTA stack barely
          fits ~330px of visible height, and the hairline is the one purely
          decorative row. */}
      <Divider className="short:hidden" />

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
          className="max-h-[42dvh] w-auto max-w-[min(88vw,640px)] rounded-sm short:max-h-[26dvh]"
        />
      <Divider />
      
      <ButtonLink href="/explore">
        Step Aboard
      </ButtonLink>
    </main>
  );
}
