import { ArrowRight } from "lucide-react";

export function ProcessSteps({ steps }: { steps: { title: string; text: string }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {steps.map((step, index) => (
        <article key={step.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-brand text-sm font-extrabold text-white">
              {index + 1}
            </span>
            {index < steps.length - 1 ? (
              <ArrowRight aria-hidden="true" className="hidden h-5 w-5 text-slate-300 md:block" />
            ) : null}
          </div>
          <h3 className="text-base font-extrabold text-slate-950">{step.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-650">{step.text}</p>
        </article>
      ))}
    </div>
  );
}
