export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-widest text-slate">
        Abhas · আভাস · Early-Warning Skeleton
      </p>
      <h1 className="text-3xl font-bold text-navy">
        Rain today. Risk in three weeks. Act now.
      </h1>
      <p className="max-w-xl text-base text-slate">
        Dashboard slices (ward risk, rainfall lags, what-if scenario, city heatmap, and validation) are
        being wired to the locked FastAPI contract.
      </p>
    </main>
  );
}
