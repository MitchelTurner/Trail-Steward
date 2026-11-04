import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { Question, PathwayOutline } from '../types';
import { buttonClass, inputClass } from '../ui';

type Answers = Record<string, string | string[]>;

function answered(question: Question, answers: Answers): boolean {
  const value = answers[question.id];
  if (question.type === 'multi') return Array.isArray(value) && value.length > 0;
  return typeof value === 'string' && value.trim().length > 0;
}

export function StartPage() {
  const { pathwaySlug = '' } = useParams();
  const navigate = useNavigate();
  const pathway = useQuery({
    queryKey: ['pathway', pathwaySlug],
    queryFn: () => api<PathwayOutline>(`/api/pathways/${pathwaySlug}`),
  });
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [otherText, setOtherText] = useState('');
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: (payload: Answers) =>
      api<{ token: string; url: string }>('/api/checklists', {
        method: 'POST',
        body: JSON.stringify({ pathwaySlug, answers: payload }),
      }),
    onSuccess: (result) => navigate(result.url),
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : 'Could not save the checklist.'),
  });

  if (pathway.isLoading) return <p>Loading…</p>;
  if (pathway.error instanceof ApiError) {
    return (
      <p>
        {pathway.error.status === 404
          ? 'This pathway is not published yet.'
          : pathway.error.message}
      </p>
    );
  }
  if (!pathway.data) return null;
  const questions = pathway.data.questions;
  const question = questions[step];
  if (!question) return null;

  function currentAnswers(): Answers {
    if (question?.type === 'select-or-text' && answers[question.id] === 'Other') {
      return { ...answers, [question.id]: otherText.trim() };
    }
    return answers;
  }

  function next() {
    const ready = currentAnswers();
    if (question && !answered(question, ready)) {
      setError('Please answer this question.');
      return;
    }
    setAnswers(ready);
    setError('');
    if (step === questions.length - 1) create.mutate(ready);
    else setStep((value) => value + 1);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-navy">{pathway.data.title}</h1>
      <p>{pathway.data.summary}</p>
      <details className="rounded border border-line bg-card p-3">
        <summary className="min-h-11 cursor-pointer font-medium text-navy">
          Steps this checklist can include
        </summary>
        <p className="mt-2 text-sm">
          Your answers decide which ones you see. The instructions for each step are on the checklist.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          {pathway.data.steps.map((item) => (
            <li key={item.key}>{item.title}</li>
          ))}
        </ol>
      </details>
      <div className="flex gap-2" aria-hidden="true">
        {questions.map((item, index) => (
          <span
            key={item.id}
            className={`h-3 w-3 rounded-full ${index === step ? 'bg-forest' : index < step ? 'bg-navy' : 'bg-line'}`}
          />
        ))}
      </div>
      <fieldset className="space-y-3">
        <legend className="text-lg font-medium text-navy">{question.label}</legend>
        {question.type === 'select-or-text' ? (
          <>
            <label className="block text-sm">
              <span className="sr-only">{question.label}</span>
              <select
                className={inputClass}
                aria-label={question.label}
                value={typeof answers[question.id] === 'string' ? String(answers[question.id]) : ''}
                onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
              >
                <option value="">Choose one</option>
                {question.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            {answers[question.id] === 'Other' ? (
              <label className="block text-sm">
                <span className="font-medium text-navy">Community name</span>
                <input
                  className={inputClass}
                  value={otherText}
                  onChange={(event) => setOtherText(event.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}
        {question.type === 'multi'
          ? question.options.map((option) => {
              const selected = Array.isArray(answers[question.id])
                ? (answers[question.id] as string[])
                : [];
              return (
                <label key={option.value} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...selected, option.value]
                        : selected.filter((value) => value !== option.value);
                      setAnswers({ ...answers, [question.id]: next });
                    }}
                  />
                  {option.label}
                </label>
              );
            })
          : null}
        {question.type === 'single'
          ? question.options.map((option) => (
              <label key={option.value} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === option.value}
                  onChange={() => setAnswers({ ...answers, [question.id]: option.value })}
                />
                {option.label}
              </label>
            ))
          : null}
      </fieldset>
      {error ? <p className="text-stale">{error}</p> : null}
      <div className="flex gap-2">
        {step > 0 ? (
          <button
            className={buttonClass('quiet')}
            type="button"
            onClick={() => setStep((value) => value - 1)}
          >
            Back
          </button>
        ) : null}
        <button className={buttonClass()} type="button" onClick={next} disabled={create.isPending}>
          {step === questions.length - 1 ? 'See my checklist' : 'Next'}
        </button>
      </div>
    </div>
  );
}
