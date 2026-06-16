import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center">
      <h1 className="text-5xl font-bold tracking-tight text-amber-400 sm:text-7xl">
        Empress of Japan
      </h1>
      <p className="mt-6 max-w-xl text-lg text-neutral-400">
        A Web XR experience for the Vancouver Maritime Museum.
      </p>
      <Link
        href="/explore"
        className="mt-10 rounded-full bg-amber-400 px-8 py-3 font-semibold text-neutral-950 transition-colors hover:bg-amber-300"
      >
        Step aboard →
      </Link>
    </main>
  );
}
