/* 
  author: Yagnik Poshiya
  github: https://github.com/yagnikposhiya/Neurons
*/

import Link from 'next/link';

import { NeuronsLogo } from '@/components/brand/neurons-logo';
import { safeGetUser } from '@/lib/auth/safe-get-user';

export default async function HomePage() {
  const auth = await safeGetUser();
  const isLoggedIn = Boolean(auth.user);
  const companyLogos = [
    '/users/svg/1.svg',
    '/users/svg/2.svg',
    '/users/svg/3.svg',
    '/users/svg/4.svg',
    '/users/svg/5.svg',
    '/users/svg/6.svg',
    '/users/svg/7.svg',
    '/users/svg/8.svg',
  ];

  return (
    <main className="relative h-screen overflow-hidden bg-white text-neutral-950">
      <div className="gradient-orbit" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle,_rgba(15,23,42,0.12)_1px,_transparent_1px)] [background-size:18px_18px]"
        aria-hidden="true"
      />

      <header className="absolute left-1/2 top-4 z-20 flex w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 items-center justify-between rounded-full bg-white/75 px-5 py-3 text-sm font-medium font-dm-sans shadow-md backdrop-blur-sm sm:w-[calc(100%-3rem)] sm:px-6">
        <div className="flex items-center gap-2">
          <NeuronsLogo className="h-[24px] w-12" />
          <div className="font-dm-sans text-lg font-semibold tracking-tight sm:text-2xl">
            Neurons
          </div>
        </div>

        <Link
          href={isLoggedIn ? '/dashboard' : '/auth/signup'}
          className="inline-flex cursor-pointer items-center justify-center rounded-full border border-black bg-black px-5 py-2 text-sm font-semibold tracking-tight text-white font-dm-sans shadow-sm transition hover:-translate-y-0.5 hover:bg-neutral-800 hover:shadow-md sm:text-base"
        >
          {isLoggedIn ? 'Dashboard' : 'Get Started'}
        </Link>
      </header>

      <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col px-4 pb-4 pt-24 font-dm-sans sm:px-6 lg:px-8">
        <section className="flex flex-1 flex-col items-center justify-center gap-8 py-4">
          <div className="max-w-4xl text-center leading-tight">
            <h1 className="font-dm-sans text-3xl font-semibold text-neutral-900 sm:text-4xl md:text-5xl">
              <span className="block">Ready-to-deploy agents</span>
              <span className="mt-4 block">
                built by <span className="text-orange-500">Neurons</span>
              </span>
            </h1>
          </div>

          <div className="w-full max-w-4xl">
            <p className="mb-5 text-center text-2xl font-semibold text-neutral-700 sm:text-3xl">
              Used by
            </p>
            <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
              <div className="marquee-track flex w-max items-center gap-10">
                {[...companyLogos, ...companyLogos].map((logoPath, index) => (
                  <img
                    key={`${logoPath}-${index}`}
                    src={logoPath}
                    alt="Company logo"
                    className="h-14 w-auto object-contain opacity-90 sm:h-16 md:h-20"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-2 flex justify-center text-base text-neutral-500 sm:text-base">
          <p className="tracking-tight">
            ©2026 Neurowork Labs. All rights reserved
          </p>
        </footer>
      </div>
    </main>
  );
}
