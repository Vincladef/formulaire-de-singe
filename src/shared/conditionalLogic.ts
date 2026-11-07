import type { StudioPageData } from './studio';

export type LogicOperator =
  'equals' | 'not_equals' | 'contains' | 'not_contains' |
  'is_empty' | 'not_empty' | 'greater_than' | 'less_than';
export type LogicCondition = {
  sourceKey: string;
  operator: LogicOperator;
  value?: string;
};
export type LogicGroup = { match: 'all' | 'any'; conditions: LogicCondition[] };
export type VisibilityLogic = LogicGroup & { action: 'show' | 'hide' };
export type BranchLogic = LogicGroup & { target: string };
export type QuestionLogic = {
  visibility?: VisibilityLogic;
  requiredWhen?: LogicGroup;
  branch?: BranchLogic;
};

export type LogicQuestion = {
  id: string; type: string; required: boolean;
  settings?: Record<string, unknown>;
};
export type LogicPage<T extends LogicQuestion = LogicQuestion> = {
  id: string; questions: T[];
};
export type LogicAnswers = Record<string, unknown>;
export type LogicEvaluation = {
  pageIndices: number[];
  visibleIds: Set<string>;
  requiredIds: Set<string>;
};

const operators: readonly LogicOperator[] = [
  'equals','not_equals','contains','not_contains','is_empty','not_empty','greater_than','less_than',
];
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function logicKey(question: LogicQuestion): string {
  const key = question.settings?.logicId;
  return typeof key === 'string' && key.length > 0 ? key : question.id;
}

/** Keys are stored in question settings; unlike database question IDs, they survive version forking. */
export function withStableLogicKeys(pages: StudioPageData[]): StudioPageData[] {
  const used = new Set<string>();
  return pages.map(page => ({
    ...page,
    questions: page.questions.map(q => {
      let key = typeof q.settings.logicId === 'string' ? q.settings.logicId : q.id;
      if (used.has(key)) key = crypto.randomUUID();
      used.add(key);
      return { ...q, settings: { ...q.settings, logicId: key } };
    }),
  }));
}

export function readLogic(question: LogicQuestion): QuestionLogic {
  const raw = question.settings?.logic;
  if (!object(raw)) return {};
  return raw as QuestionLogic;
}

function isGroup(value: unknown): value is LogicGroup {
  if (!object(value) || (value.match !== 'all' && value.match !== 'any') ||
      !Array.isArray(value.conditions) || value.conditions.length === 0 || value.conditions.length > 20) return false;
  return value.conditions.every(condition => object(condition) &&
    typeof condition.sourceKey === 'string' && condition.sourceKey.length > 0 &&
    operators.includes(condition.operator as LogicOperator) &&
    (condition.value === undefined || typeof condition.value === 'string'));
}
function readableValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
  return '';
}
function isEmpty(raw: unknown): boolean {
  if (Array.isArray(raw)) return raw.length === 0;
  return raw === undefined || raw === null || readableValue(raw).trim() === '';
}

function matchesCondition(condition: LogicCondition, answers: LogicAnswers, sources: Map<string, string>): boolean {
  const id = sources.get(condition.sourceKey);
  if (!id) return false;
  const raw = answers[id];
  if (condition.operator === 'is_empty') return isEmpty(raw);
  if (condition.operator === 'not_empty') return !isEmpty(raw);
  if (isEmpty(raw)) return false;
  const value = condition.value ?? '';
  const text = readableValue(raw);
  if (condition.operator === 'equals') return Array.isArray(raw) ? raw.includes(value) : text === value;
  if (condition.operator === 'not_equals') return Array.isArray(raw) ? !raw.includes(value) : text !== value;
  if (condition.operator === 'contains') return Array.isArray(raw) ? raw.includes(value) : text.toLocaleLowerCase('fr').includes(value.toLocaleLowerCase('fr'));
  if (condition.operator === 'not_contains') return Array.isArray(raw) ? !raw.includes(value) : !text.toLocaleLowerCase('fr').includes(value.toLocaleLowerCase('fr'));
  const n = Number(text);
  const threshold = Number(value);
  if (!Number.isFinite(n) || !Number.isFinite(threshold)) return false;
  return condition.operator === 'greater_than' ? n > threshold : n < threshold;
}
export function matchesGroup(group: LogicGroup | undefined, answers: LogicAnswers, sources: Map<string, string>): boolean {
  if (!isGroup(group)) return false;
  const results = group.conditions.map(condition => matchesCondition(condition, answers, sources));
  return group.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

/**
 * Simulate a form in page order. Only reached, visible answers can affect downstream rules.
 * Forward-only jumps make cycles impossible. Pages with only hidden input questions are skipped.
 */
export function evaluateLogic(pages: LogicPage[], answers: LogicAnswers): LogicEvaluation {
  const visibleIds = new Set<string>();
  const requiredIds = new Set<string>();
  const pageIndices: number[] = [];
  const sources = new Map<string, string>();
  const pageTargets = new Map<string, number>();
  pages.forEach((page, index) => {
    const first = page.questions[0];
    if (first) pageTargets.set(logicKey(first), index);
  });

  let index = 0;
  while (index < pages.length) {
    const page = pages[index];
    const candidateIds: string[] = [];
    const candidateRequired: string[] = [];
    const temporarySources = new Map(sources);
    for (const question of page.questions) {
      const logic = readLogic(question);
      let shown = true;
      if (logic.visibility && isGroup(logic.visibility)) {
        const matched = matchesGroup(logic.visibility, answers, temporarySources);
        shown = logic.visibility.action === 'show' ? matched : !matched;
      }
      if (!shown) continue;
      candidateIds.push(question.id);
      temporarySources.set(logicKey(question), question.id);
      if (question.type !== 'statement' && (question.required || matchesGroup(logic.requiredWhen, answers, temporarySources))) {
        candidateRequired.push(question.id);
      }
    }
    const hasAnyInput = page.questions.some(q => q.type !== 'statement');
    const hasVisibleInput = page.questions.some(q => q.type !== 'statement' && candidateIds.includes(q.id));
    if (hasAnyInput && !hasVisibleInput) {
      index++;
      continue;
    }

    pageIndices.push(index);
    candidateIds.forEach(id => visibleIds.add(id));
    candidateRequired.forEach(id => requiredIds.add(id));
    for (const [key, id] of temporarySources) sources.set(key,id);

    let destination: number | 'END' | undefined;
    for (const question of page.questions) {
      if (!visibleIds.has(question.id)) continue;
      const branch = readLogic(question).branch;
      if (!branch || !matchesGroup(branch, answers, sources)) continue;
      if (branch.target === 'END') { destination = 'END'; break; }
      const to = pageTargets.get(branch.target);
      if (to !== undefined && to > index) { destination = to; break; }
    }
    if (destination === 'END') break;
    index = destination ?? index + 1;
  }
  return { pageIndices, visibleIds, requiredIds };
}

/** Editing validation protects against forward references, dangling choices and cyclic jumps. */
export function validateConditionalSettings(pages: StudioPageData[]): string[] {
  const errors: string[] = [];
  const ordered = pages.flatMap((p, pageIndex) => p.questions.map((q, questionIndex) => ({ q, pageIndex, questionIndex })));
  const byKey = new Map(ordered.map((entry, i) => [logicKey(entry.q), { ...entry, order: i }]));
  if (byKey.size !== ordered.length) errors.push('Identifiants de logique répétés. Duplique la question pour régénérer son identifiant.');
  const targets = new Map(pages.flatMap((page, index) => page.questions[0] ? [[logicKey(page.questions[0]), index] as const] : []));
  for (let i = 0; i < ordered.length; i++) {
    const { q, pageIndex } = ordered[i];
    const data = readLogic(q);
    for (const name of ['visibility','requiredWhen','branch'] as const) {
      const group = data[name];
      if (group === undefined) continue;
      if (!isGroup(group)) { errors.push('Règle incomplète sur « ' + q.label.slice(0,45) + ' ».'); continue; }
      for (const condition of group.conditions) {
        const source = byKey.get(condition.sourceKey);
        if (!source || (name === 'branch' ? source.order > i : source.order >= i)) {
          errors.push('Une règle de « ' + q.label.slice(0,45) + ' » doit viser une question précédente.');
          continue;
        }
        if (['equals','not_equals'].includes(condition.operator) &&
            ['single_choice','multiple_choice','select'].includes(source.q.type) &&
            !source.q.options.some(option => option.value === condition.value)) {
          errors.push('Un choix référencé par « ' + q.label.slice(0,45) + ' » a été supprimé.');
        }
      }
      if (name === 'visibility' && (group as VisibilityLogic).action !== 'show' &&
          (group as VisibilityLogic).action !== 'hide') errors.push('Action de visibilité inconnue.');
      if (name === 'branch') {
        const target = (group as BranchLogic).target;
        if (target !== 'END' && ((targets.get(target) ?? -1) <= pageIndex))
          errors.push('La destination de « ' + q.label.slice(0,45) + ' » doit être une page suivante.');
      }
    }
  }
  return errors;
}
