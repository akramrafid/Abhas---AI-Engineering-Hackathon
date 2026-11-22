"use client";

import { TimelineContent } from "@/components/ui/timeline-animation";
import Image from "next/image";
import { useRef } from "react";

export function ClientFeedback() {
  const testimonialRef = useRef<HTMLDivElement>(null);

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        delay: i * 0.25,
        duration: 0.5,
      },
    }),
    hidden: {
      filter: "blur(10px)",
      y: -20,
      opacity: 0,
    },
  };

  return (
    <main className="w-full bg-paper text-navy">
      <section
        className="relative container mx-auto h-full rounded-2xl bg-paper py-14 text-navy"
        ref={testimonialRef}
      >
        <article className="mx-auto max-w-screen-md space-y-2 text-center">
          <TimelineContent
            as="h2"
            className="text-3xl font-bold tracking-tight text-navy xl:text-4xl"
            animationNum={0}
            customVariants={revealVariants}
            timelineRef={testimonialRef}
          >
            Trusted by Field Epidemiologists & City Corporation Health Officers
          </TimelineContent>
          <TimelineContent
            as="p"
            className="mx-auto max-w-xl text-sm text-slate md:text-base"
            animationNum={1}
            customVariants={revealVariants}
            timelineRef={testimonialRef}
          >
            Hear how vector control officers and public health authorities use
            Abhas (আভাস) for preemptive dengue interventions.
          </TimelineContent>
        </article>

        <div className="flex w-full flex-col gap-3 px-4 pt-10 pb-4 lg:grid lg:grid-cols-3 lg:py-10 lg:px-10">
          {/* Column 1 */}
          <div className="flex h-full flex-col gap-3 md:flex lg:space-y-0">
            <TimelineContent
              animationNum={0}
              customVariants={revealVariants}
              timelineRef={testimonialRef}
              className="relative flex flex-[6] flex-col justify-between overflow-hidden rounded-xl border border-mist bg-navy p-6 text-white lg:flex-[7]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"
              />
              <article className="relative z-10 mt-auto">
                <p className="text-sm leading-relaxed text-mist md:text-base">
                  &ldquo;Abhas gave our zonal teams a 2-week early warning ahead
                  of the monsoon surge in Mirpur. We pre-positioned Bti larvicide
                  crews before hospital admissions peaked.&rdquo;
                </p>
                <div className="flex items-center justify-between pt-5">
                  <div>
                    <h3 className="text-base font-bold text-white lg:text-lg">
                      Dr. Tariqul Islam
                    </h3>
                    <p className="font-mono text-xs text-mist">
                      Chief Health Officer, DNCC (Zone 4)
                    </p>
                  </div>
                  <Image
                    src="https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80"
                    alt="Dr. Tariqul Islam portrait"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                </div>
              </article>
            </TimelineContent>

            <TimelineContent
              animationNum={1}
              customVariants={revealVariants}
              timelineRef={testimonialRef}
              className="relative flex flex-[4] flex-col justify-between overflow-hidden rounded-xl border border-mist bg-royal p-6 text-white lg:h-fit lg:shrink-0 lg:flex-[3]"
            >
              <article className="mt-auto">
                <p className="text-sm leading-relaxed text-white">
                  &ldquo;The explainable SHAP weather waterfall gives our council
                  confidence. We can see exactly why Ward 12 is flagged.&rdquo;
                </p>
                <div className="flex items-center justify-between pt-5">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Nasreen Akhtar
                    </h3>
                    <p className="font-mono text-xs text-white/80">
                      Vector Control Lead, DSCC
                    </p>
                  </div>
                  <Image
                    src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80"
                    alt="Nasreen Akhtar portrait"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                </div>
              </article>
            </TimelineContent>
          </div>

          {/* Column 2 */}
          <div className="flex h-fit flex-col gap-3 md:flex lg:h-full lg:space-y-0">
            <TimelineContent
              animationNum={2}
              customVariants={revealVariants}
              timelineRef={testimonialRef}
              className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-mist bg-ink p-6 text-white"
            >
              <article className="mt-auto">
                <p className="text-sm leading-relaxed text-mist">
                  &ldquo;Offline deterministic fallback ensures our field ops
                  never stall, even when cellular backhaul drops in southern
                  Chattogram.&rdquo;
                </p>
                <div className="flex items-center justify-between pt-5">
                  <div>
                    <h3 className="text-base font-bold text-white lg:text-lg">
                      Engr. Rafiqul Hassan
                    </h3>
                    <p className="font-mono text-xs text-mist">
                      Sanitation Inspector, CCC
                    </p>
                  </div>
                  <Image
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
                    alt="Rafiqul Hassan portrait"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                </div>
              </article>
            </TimelineContent>

            <TimelineContent
              animationNum={3}
              customVariants={revealVariants}
              timelineRef={testimonialRef}
              className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-mist bg-ink p-6 text-white"
            >
              <article className="mt-auto">
                <p className="text-sm leading-relaxed text-mist">
                  &ldquo;The bilingual English and Bengali operations brief saved
                  us hours during emergency inter-agency coordination meetings.&rdquo;
                </p>
                <div className="flex items-center justify-between pt-5">
                  <div>
                    <h3 className="text-base font-bold text-white lg:text-lg">
                      Dr. Shamima Sultana
                    </h3>
                    <p className="font-mono text-xs text-mist">
                      Surveillance Specialist, IEDCR
                    </p>
                  </div>
                  <Image
                    src="https://images.unsplash.com/photo-1594824813589-9a74a3821a7c?w=150&auto=format&fit=crop&q=80"
                    alt="Dr. Shamima Sultana portrait"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                </div>
              </article>
            </TimelineContent>

            <TimelineContent
              animationNum={4}
              customVariants={revealVariants}
              timelineRef={testimonialRef}
              className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-mist bg-ink p-6 text-white"
            >
              <article className="mt-auto">
                <p className="text-sm leading-relaxed text-mist">
                  &ldquo;Averaging 83.3% hold-out accuracy across 48 critical
                  monsoon test cases makes this an actionable decision console.&rdquo;
                </p>
                <div className="flex items-center justify-between pt-5">
                  <div>
                    <h3 className="text-base font-bold text-white lg:text-lg">
                      Zahidul Karim
                    </h3>
                    <p className="font-mono text-xs text-mist">
                      Operations Director, DGHS MIS
                    </p>
                  </div>
                  <Image
                    src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80"
                    alt="Zahidul Karim portrait"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                </div>
              </article>
            </TimelineContent>
          </div>

          {/* Column 3 */}
          <div className="flex h-full flex-col gap-3 md:flex lg:space-y-0">
            <TimelineContent
              animationNum={5}
              customVariants={revealVariants}
              timelineRef={testimonialRef}
              className="relative flex flex-[4] flex-col justify-between overflow-hidden rounded-xl border border-mist bg-royal p-6 text-white lg:flex-[3]"
            >
              <article className="mt-auto">
                <p className="text-sm leading-relaxed text-white">
                  &ldquo;Resource allocation is finally data-driven rather than
                  reactive. Our fogging teams deploy where risk will be, not where
                  it was.&rdquo;
                </p>
                <div className="flex items-center justify-between pt-5">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Mahbubur Rahman
                    </h3>
                    <p className="font-mono text-xs text-white/80">
                      Chief Vector Control Officer, DNCC
                    </p>
                  </div>
                  <Image
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80"
                    alt="Mahbubur Rahman portrait"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                </div>
              </article>
            </TimelineContent>

            <TimelineContent
              animationNum={6}
              customVariants={revealVariants}
              timelineRef={testimonialRef}
              className="relative flex flex-[6] flex-col justify-between overflow-hidden rounded-xl border border-mist bg-navy p-6 text-white lg:flex-[7]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff12_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"
              />
              <article className="relative z-10 mt-auto">
                <p className="text-sm leading-relaxed text-mist md:text-base">
                  &ldquo;Abhas represents a landmark leap for vector-borne
                  disease surveillance in South Asia. Its strict rate limiting,
                  zero-key local runtime, and transparent model card set a gold
                  standard for public sector AI.&rdquo;
                </p>
                <div className="flex items-center justify-between pt-5">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Dr. Jennifer Craig
                    </h3>
                    <p className="font-mono text-xs text-mist">
                      Public Health Epidemiologist & Surveillance Advisor
                    </p>
                  </div>
                  <Image
                    src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80"
                    alt="Dr. Jennifer Craig portrait"
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-full border border-white/20 object-cover"
                  />
                </div>
              </article>
            </TimelineContent>
          </div>
        </div>

        {/* Framing border detail */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-4 left-[5%] z-[2] h-16 w-[90%] border-b-2 border-mist md:left-0 md:w-full"
        >
          <div className="relative container mx-auto h-full w-full before:absolute before:-bottom-2 before:-left-2 before:h-4 before:w-4 before:border before:border-mist before:bg-white before:shadow-sm after:absolute after:-right-2 after:-bottom-2 after:h-4 after:w-4 after:border after:border-mist after:bg-white after:shadow-sm" />
        </div>
      </section>
    </main>
  );
}

export default ClientFeedback;
