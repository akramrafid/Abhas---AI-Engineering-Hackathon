const STAGES = [
  {
    name: "Weather in",
    detail: "Temperature, humidity and rain per ward, from the dataset or one cached Open-Meteo call for all five cities.",
    measure: "1 call per 6 h",
  },
  {
    name: "Breeding clock",
    detail: "Rain lagged 1 to 6 weeks for each ward on its own timeline, plus water-logging, density and sanitation.",
    measure: "lags grouped by ward_id",
  },
  {
    name: "Forecast",
    detail: "LightGBM with a Poisson objective, one model per horizon, rain held to only ever raise risk.",
    measure: "h = 1, 2, 3, 4 weeks",
  },
  {
    name: "Tier and action",
    detail: "Expected cases with an 80% range, turned into Low, Medium, High or Critical and one action for the officer.",
    measure: "4 tiers · 1 action",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="bg-white px-4 py-24 text-ink sm:px-8 lg:px-14 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 id="how-heading" className="max-w-3xl text-balance text-[clamp(2rem,4vw,3.25rem)] font-light leading-[1.08] tracking-[-0.025em]">
          From this week&apos;s rain to next month&apos;s ward list, in four steps.
        </h2>
        <ol className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
          <span aria-hidden="true" className="absolute left-0 right-0 top-[7px] hidden h-px bg-mist md:block" />
          {STAGES.map((stage, index) => (
            <li key={stage.name} className="relative">
              <span
                aria-hidden="true"
                className={`relative block h-[15px] w-[15px] rounded-full ring-4 ring-white ${index === STAGES.length - 1 ? "bg-navy" : "bg-royal"}`}
              />
              <h3 className="mt-6 text-lg font-bold">{stage.name}</h3>
              <p className="mt-2 text-body text-slate">{stage.detail}</p>
              <p className="mt-4 font-mono text-xs text-navy">{stage.measure}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
