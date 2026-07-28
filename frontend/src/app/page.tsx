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
<<<<<<< HEAD
<<<<<<< HEAD
          <span className="mb-1 block text-2xl font-semibold italic tracking-normal text-brass lg:mb-1.5 lg:text-4xl [@media(max-height:520px)]:mb-0.5 [@media(max-height:520px)]:text-2xl">
=======
          <span className="mb-1 block text-3xl font-semibold italic tracking-normal text-brass lg:mb-1.5 lg:text-4xl [@media(max-height:520px)]:mb-0.5 [@media(max-height:520px)]:text-2xl">
>>>>>>> bcde1bd (Removed the card style of the key art on the landing page to avoid confusing it with a button.)
=======
          <span className="mb-1 block text-2xl font-semibold italic tracking-normal text-brass lg:mb-1.5 lg:text-4xl [@media(max-height:520px)]:mb-0.5 [@media(max-height:520px)]:text-2xl">
>>>>>>> 22cb4e5 (Now the title on the landing page has the same responsive ratio.)
            Echoes of 
          </span>
          The Empress of Japan
        </h1>
        <p className="mx-auto max-w-xl text-sm text-navy-soft lg:text-base">
<<<<<<< HEAD
<<<<<<< HEAD
          Immersive experience designed for Vancouver Maritime Museum visitors
=======
          A browser-based experience designed for the Vancouver Maritime Museum: Empress of Japan
>>>>>>> bcde1bd (Removed the card style of the key art on the landing page to avoid confusing it with a button.)
=======
          Immersive experience designed for Vancouver Maritime Museum visitors
>>>>>>> 77400a1 (Streamlined the description on the landing page, and added a divider to further separate the illustration and the button.)
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
<<<<<<< HEAD
<<<<<<< HEAD
       <Divider />
=======

>>>>>>> bcde1bd (Removed the card style of the key art on the landing page to avoid confusing it with a button.)
=======
       <Divider />
>>>>>>> 77400a1 (Streamlined the description on the landing page, and added a divider to further separate the illustration and the button.)

      <ButtonLink href="/explore">
        Step Aboard
      </ButtonLink>
    </main>
  );
}
