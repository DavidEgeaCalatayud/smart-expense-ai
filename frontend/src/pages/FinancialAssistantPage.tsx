import { FormEvent, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Database, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { getApiErrorPresentation } from '../services/apiClient';
import { queryFinancialAssistant } from '../services/financialAssistantApi';
import type { FinancialAssistantAnswer } from '../types/financialAssistant';

const examples = [
  '¿Cómo voy este mes?',
  '¿Por qué he gastado más que el mes pasado?',
  '¿Qué presupuestos necesitan mi atención?',
  '¿Qué gastos inusuales debería revisar?',
  '¿Tengo suscripciones que parecen duplicadas?',
  '¿Qué ha cambiado en mis gastos durante los últimos seis meses?',
];

const sourceLabels = {
  financial_summary: 'Resumen financiero',
  period_comparison: 'Comparación de periodos',
  budget: 'Presupuestos',
  financial_findings: 'Inteligencia financiera',
  historical_analysis: 'Histórico financiero',
  transaction_search: 'Búsqueda de movimientos',
} as const;

export function FinancialAssistantPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<FinancialAssistantAnswer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const submitQuestion = async (event?: FormEvent) => {
    event?.preventDefault();
    const normalized = question.trim();
    if (normalized.length < 3 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      setAnswer(await queryFinancialAssistant(normalized));
    } catch (caught) {
      const presentation = getApiErrorPresentation(caught, 'No se ha podido consultar el asistente financiero.');
      setError({ title: presentation.title, message: presentation.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="space-y-6">
      <section className="rounded-3xl bg-slate-950 p-7 text-white shadow-soft">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Bot size={24} />
            </div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand-200">Asistente financiero</p>
            <h1 className="text-3xl font-bold tracking-tight">Pregunta directamente sobre tus finanzas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              El asistente usa tus movimientos, presupuestos y análisis para responder con contexto de tus propias finanzas.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:w-[28rem] lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck size={17} /> Tus datos</div>
              <p className="text-slate-300">Solo se utiliza la información financiera asociada a tu cuenta.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold"><Database size={17} /> Respuestas justificadas</div>
              <p className="text-slate-300">Las respuestas se apoyan en datos disponibles de tu actividad financiera.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Sparkles size={19} /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Haz una pregunta</h2>
              <p className="text-sm text-slate-500">Haz una pregunta sobre tus finanzas y revisa la información que respalda la respuesta.</p>
            </div>
          </div>

          <form onSubmit={(event) => void submitQuestion(event)} className="space-y-4">
            <label htmlFor="financial-question" className="block text-sm font-semibold text-slate-700">Pregunta sobre tus finanzas</label>
            <textarea
              id="financial-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              maxLength={1200}
              placeholder="¿Por qué he gastado más este mes?"
              className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-slate-400">{question.length}/1200</p>
              <button
                type="submit"
                disabled={question.trim().length < 3 || isSubmitting}
                className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={16} />
                {isSubmitting ? 'Analizando tus datos…' : 'Preguntar al asistente'}
              </button>
            </div>
          </form>

          {error && (
            <div role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={17} /> {error.title}</div>
              <p>{error.message}</p>
            </div>
          )}

          {answer && (
            <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6" aria-label="Financial Assistant answer">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-700"><Bot size={18} /> Respuesta</div>
              <p className="whitespace-pre-wrap text-base leading-7 text-slate-800">{answer.answer}</p>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900">Basado en</h3>
                {answer.evidence.length > 0 ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {answer.evidence.map((item) => (
                      <article key={`${item.source}:${item.reference}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{sourceLabels[item.source]}</p>
                            <p className="mt-1 text-sm text-slate-600">{item.label}</p>
                            <p className="mt-1 break-all text-xs text-slate-400">{item.reference}</p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">No se han necesitado datos adicionales para esta respuesta.</p>
                )}
              </div>

              {answer.limitations.length > 0 && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} /> Límites de la respuesta</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                    {answer.limitations.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}

              <p className="mt-5 text-xs text-slate-400">Consulta {answer.requestId}</p>
            </section>
          )}
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Prueba a preguntar</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Puedes empezar con cualquiera de estas preguntas.</p>
          <div className="mt-5 space-y-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuestion(example)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
              >
                {example}
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <strong className="text-slate-900">Privacidad:</strong> el asistente no ejecuta pagos ni realiza cambios financieros por su cuenta.
          </div>
        </aside>
      </section>
    </main>
  );
}
