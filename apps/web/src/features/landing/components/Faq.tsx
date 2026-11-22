import { Plus } from "lucide-react";

// Every answer restates facts from TASK.md, ARCHITECTURE.md or the live validation endpoint.
const FAQ = [
  {
    q: "Is this real outbreak data?",
    a: "It is the organisers' dataset: 60 wards across Dhaka North, Dhaka South, Chattogram, Gazipur and Narayanganj, weekly from January 2016 to December 2025. It looks simulated, so treat the accuracy figures as a demonstration, not a real-world claim.",
  },
  {
    q: "How far ahead does it see?",
    a: "One to four weeks for every ward. The rain signal is strongest three weeks out: cases correlate 0.47 with rain three weeks earlier once the season is removed, against 0.03 for the same week.",
  },
  {
    q: "How accurate is it?",
    a: "On 2024 and 2025, years locked away before training and scored once, the three-week forecast misses by about one case per ward-week on average, 20% less than each ward's seasonal average. Every forecast carries an 80% range so officers see the uncertainty.",
  },
  {
    q: "What does it cost a health office to run?",
    a: "Nothing beyond a laptop. The model is a 954 KiB file that answers in under a millisecond per ward on the CPU. Live weather is one Open-Meteo request for all five cities every six hours. The optional Claude Haiku advisory has a hard cap of one dollar a day; without a key a free template writes the same advice.",
  },
  {
    q: "Does it need the internet?",
    a: "No. The dashboard runs offline from the dataset. Live weather, the advisory text, the map tiles and sign-in are optional extras.",
  },
  {
    q: "Why are ward positions on the map approximate?",
    a: "The dataset has ward numbers but no boundaries, so each ward is placed near its city corporation's real centre. Abhas never draws ward outlines it does not have.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-white px-4 py-24 text-ink sm:px-8 lg:py-32 scroll-mt-20">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-20">
        <div>
          <h2 id="faq-heading" className="text-balance text-[clamp(2rem,4vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy">
            Questions officers ask first.
          </h2>
          <p className="mt-4 max-w-sm text-body text-slate">Short answers, with the numbers behind them.</p>
        </div>
        <div className="divide-y divide-mist border-y border-mist">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 rounded-md py-3 text-lg font-semibold text-navy">
                {item.q}
                <Plus
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-royal transition-transform duration-300 group-open:rotate-45"
                />
              </summary>
              <p className="max-w-[62ch] pb-5 text-body text-slate">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
