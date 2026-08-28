import { FormEvent, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Database, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { getApiErrorPresentation } from '../services/apiClient';
import { queryFinancialAssistant } from '../services/financialAssistantApi';
import type { FinancialAssistantAnswer } from '../types/financialAssistant';

const examples = [
  'How am I doing this month?',
  'Why did I spend more than last month?',
  'Which budgets need my attention?',
  'What unusual expenses should I review?',
  'Do I have duplicate-looking subscriptions?',
  'What changed in my spending over the last six months?',
];

const sourceLabels = {
  financial_summary: 'Transaction analytics',
  period_comparison: 'Period comparison',
  budget: 'Budget service',
  financial_findings: 'Financial intelligence',
  historical_analysis: 'Historical-v2.2',
  transaction_search: 'Transaction search',
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
      const presentation = getApiErrorPresentation(caught, 'Unable to ask the Financial Assistant.');
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
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-brand-200">Financial Assistant v1</p>
            <h1 className="text-3xl font-bold tracking-tight">Ask your financial data, not a black box</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              The assistant explains evidence produced by your authenticated analytics, budgets, rules-v2 findings and historical-v2.2 data. Financial calculations stay in backend services.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:w-[28rem] lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold"><ShieldCheck size={17} /> Account scoped</div>
              <p className="text-slate-300">The model cannot choose or submit a user ID.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 font-semibold"><Database size={17} /> Evidence grounded</div>
              <p className="text-slate-300">Only evidence emitted by executed financial tools can be shown.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Sparkles size={19} /></div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Ask a question</h2>
              <p className="text-sm text-slate-500">One stateless question at a time. No persistent chat history.</p>
            </div>
          </div>

          <form onSubmit={(event) => void submitQuestion(event)} className="space-y-4">
            <label htmlFor="financial-question" className="block text-sm font-semibold text-slate-700">Ask about your finances</label>
            <textarea
              id="financial-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              maxLength={1200}
              placeholder="Why did I spend more this month?"
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
                {isSubmitting ? 'Checking evidence...' : 'Ask Financial Assistant'}
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
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-700"><Bot size={18} /> Evidence-grounded answer</div>
              <p className="whitespace-pre-wrap text-base leading-7 text-slate-800">{answer.answer}</p>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-900">Based on</h3>
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
                  <p className="mt-2 text-sm text-slate-500">No financial evidence was required for this answer.</p>
                )}
              </div>

              {answer.limitations.length > 0 && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} /> Limitations</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                    {answer.limitations.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              )}

              <p className="mt-5 text-xs text-slate-400">Request {answer.requestId}</p>
            </section>
          )}
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Try asking</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">These prompts map naturally to the read-only evidence tools available in v1.</p>
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
            <strong className="text-slate-900">v1 boundaries:</strong> no RAG, vector database, persistent memory, multi-agent routing or autonomous financial actions.
          </div>
        </aside>
      </section>
    </main>
  );
}
