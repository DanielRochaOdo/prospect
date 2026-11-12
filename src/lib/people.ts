/** Normalização estrita de pessoas e vínculo com a empresa pesquisada. */
export type PeopleProvider = 'apollo' | 'hunter';
export type DecisionMaker = {
  name: string;
  role: string;
  organization: string;
  source: PeopleProvider;
  partialName: boolean;
};

const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const nonempty = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
const stop = new Set(['ltda','sa','s','a','eireli','mei','epp','me','limitada','sociedade',
  'companhia','cia','empresa','empresas','comercio','servicos','industria','de','do','da','dos','das','e']);
const tokens = (v: string): string[] => normalize(v).split(' ').filter(w => w.length >= 3 && !stop.has(w));

/** Sem vínculo verificável, não relacionar uma pessoa a uma empresa por aproximação frouxa. */
export function organizationMatches(requested: string, returned: string): boolean {
  const a = tokens(requested), b = tokens(returned);
  if (!a.length || !b.length) return false;
  const same = a.filter(w => b.includes(w));
  if (!same.length) return false;
  if (same.length >= 2) return same.length / Math.min(a.length, b.length) >= 0.65;
  return a.length === 1 && a[0].length >= 4 && b.includes(a[0]);
}

export function validDomain(input: string): string | null {
  let host = input.trim().toLowerCase();
  if (!host) return null;
  if (/^https?:\/\//.test(host)) { try { host = new URL(host).hostname; } catch { return null; } }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  if (host.length > 253 || !/^(?=.{4,253}$)(?!-)[a-z\d-]+(?:\.[a-z\d-]+)+$/.test(host)) return null;
  if (host.split('.').some(s => s.startsWith('-') || s.endsWith('-'))) return null;
  if (/^(gmail|hotmail|outlook|yahoo|icloud)\./.test(host)) return null;
  return host;
}

export function mapApolloPeople(payload: unknown, requestedCompany: string): DecisionMaker[] {
  const people = record(payload).people;
  if (!Array.isArray(people)) return [];
  return people.flatMap(value => {
    const p = record(value), org = nonempty(record(p.organization).name);
    if (!org || !organizationMatches(requestedCompany, org)) return [];
    const first = nonempty(p.first_name), last = nonempty(p.last_name), mask = nonempty(p.last_name_obfuscated);
    const name = nonempty(p.name) || [first, last || mask].filter(Boolean).join(' ');
    const role = nonempty(p.title);
    if (!name || !role) return [];
    return [{name, role, organization: org, source: 'apollo' as const,
      partialName: !last && !nonempty(p.name)}];
  });
}

export function mapHunterPeople(payload: unknown, requestedCompany: string, trustedDomain: boolean): DecisionMaker[] {
  const data = record(record(payload).data);
  const org = nonempty(data.organization);
  if (!trustedDomain && !organizationMatches(requestedCompany, org)) return [];
  if (!Array.isArray(data.emails)) return [];
  return data.emails.flatMap(value => {
    const p = record(value);
    if (p.type === 'generic') return [];
    const first = nonempty(p.first_name), last = nonempty(p.last_name), role = nonempty(p.position);
    const name = [first, last].filter(Boolean).join(' ');
    if (!name || !role) return [];
    return [{name, role, organization: org || requestedCompany, source: 'hunter' as const,
      partialName: !last}];
  });
}

const positionWeight = (role: string) => {
  const r = normalize(role);
  if (/rh|recursos humanos|human resources|beneficios|benefits|people operations|departamento pessoal|gestao de pessoas|dp/.test(r)) return 50;
  if (/diretor|director|gerente|manager|coordenad|coordinator|head|ceo|presidente|president|socio|owner|chro|administra|cfo/.test(r)) return 25;
  return 0;
};
/** Exibe gestores e cargos relevantes; sobrenomes ofuscados nunca são adivinhados. */
export function mergeDecisionMakers(people: DecisionMaker[], limit = 8): DecisionMaker[] {
  const ranked = [...people].filter(p => p.name && p.role && positionWeight(p.role) > 0)
    .sort((a,b) => positionWeight(b.role) - positionWeight(a.role) || Number(a.partialName) - Number(b.partialName));
  const out: DecisionMaker[] = [];
  for (const p of ranked) {
    const normalizedName = normalize(p.name).split(' ');
    const first = normalizedName[0];
    const role = normalize(p.role);
    const match = out.find(x => {
      const xn = normalize(x.name).split(' ');
      return normalize(x.role) === role && xn[0] === first && (
        normalize(x.name) === normalize(p.name) ||
        (x.partialName && normalizedName[1]?.slice(0,2) === xn[1]?.slice(0,2)) ||
        (p.partialName && normalizedName[1]?.slice(0,2) === xn[1]?.slice(0,2))
      );
    });
    if (match) {
      if (match.partialName && !p.partialName) Object.assign(match,p);
    } else out.push({...p});
    if (out.length >= limit) break;
  }
  return out;
}
