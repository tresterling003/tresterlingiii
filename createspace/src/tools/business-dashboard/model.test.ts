import { describe, expect, it } from 'vitest';
import {
  clientSummaries,
  expensesCsv,
  incomeCsv,
  monthlyIncome,
  parseMoney,
  readContracts,
  readExpenses,
  readIncome,
  summarize,
  upcoming,
  yearsIn,
  type Contract,
  type ExpenseEntry,
  type IncomeEntry,
} from './model';

const inc = (o: Partial<IncomeEntry>): IncomeEntry => ({ id: Math.random().toString(), date: '2026-11-10', client: '', description: '', amountCents: 0, status: 'paid', dueDate: '', ...o });
const exp = (o: Partial<ExpenseEntry>): ExpenseEntry => ({ id: Math.random().toString(), date: '2026-11-10', description: '', category: 'Other', amountCents: 0, ...o });
const con = (o: Partial<Contract>): Contract => ({ id: Math.random().toString(), title: 'C', client: '', valueCents: 0, startDate: '', endDate: '', status: 'draft', notes: '', ...o });
const NOW = '2026-11-25';

describe('parseMoney', () => {
  it('reads common formats as cents', () => {
    expect(parseMoney('1234')).toBe(123400);
    expect(parseMoney('$1,234.50')).toBe(123450);
    expect(parseMoney('12.5')).toBe(1250);
    expect(parseMoney('0.99')).toBe(99);
    expect(parseMoney('12,50')).toBe(1250);
  });
  it('rejects bad input', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('1.234')).toBeNull();
  });
});

describe('summaries', () => {
  const income = [
    inc({ amountCents: 100000, date: '2026-11-02' }),
    inc({ amountCents: 50000, date: '2026-03-02' }),
    inc({ amountCents: 99999, date: '2025-12-31' }),
    inc({ amountCents: 20000, status: 'pending', dueDate: '2026-11-01' }),
    inc({ amountCents: 30000, status: 'pending', dueDate: '2026-12-15' }),
  ];
  const expenses = [exp({ amountCents: 25000, date: '2026-05-01' }), exp({ amountCents: 1000, date: '2025-05-01' })];

  it('totals month, year, outstanding, overdue, expenses and profit', () => {
    expect(summarize(income, expenses, NOW)).toEqual({
      earnedThisMonth: 100000,
      earnedThisYear: 150000,
      outstanding: 50000,
      overdue: 20000,
      expensesThisYear: 25000,
      profitThisYear: 125000,
    });
  });

  it('is all zero with no data', () => {
    expect(Object.values(summarize([], [], NOW)).every((v) => v === 0)).toBe(true);
  });

  it('groups paid income by month for the last 12 months', () => {
    const months = monthlyIncome(income, NOW);
    expect(months).toHaveLength(12);
    expect(months.at(-1)).toMatchObject({ key: '2026-11', cents: 100000 });
    expect(months[0].key).toBe('2025-12');
    expect(months[0].cents).toBe(99999);
    expect(months.find((m) => m.key === '2026-03')!.cents).toBe(50000);
  });

  it('lists overdue and upcoming payments and contracts ending soon', () => {
    const contracts = [con({ title: 'Ends soon', status: 'signed', endDate: '2026-12-05' }), con({ title: 'Far', status: 'signed', endDate: '2027-06-01' }), con({ title: 'Done', status: 'completed', endDate: '2026-12-01' })];
    const u = upcoming(income, contracts, NOW);
    expect(u.map((x) => [x.kind, x.daysAway])).toEqual([
      ['payment', -24],
      ['contract', 10],
      ['payment', 20],
    ]);
  });
});

describe('clients', () => {
  it('combines income and contracts by client name, case-insensitively', () => {
    const list = clientSummaries(
      [inc({ client: 'Acme', amountCents: 500 }), inc({ client: 'acme ', amountCents: 200, status: 'pending' }), inc({ client: 'Zed', amountCents: 900 })],
      [con({ client: 'ACME', status: 'signed' }), con({ client: '', status: 'signed' })],
    );
    expect(list.map((c) => [c.name, c.paidCents, c.outstandingCents, c.contracts, c.activeContracts])).toEqual([
      ['Zed', 900, 0, 0, 0],
      ['Acme', 500, 200, 1, 1],
    ]);
  });
});

describe('storage and export', () => {
  it('reads stored data defensively', () => {
    expect(readIncome({ items: [{ id: 'a', date: '2026-01-01', amountCents: 12.4, status: 'weird' }, { id: 'b', date: 'bad' }, null] })).toEqual([
      { id: 'a', date: '2026-01-01', client: '', description: '', amountCents: 12, status: 'paid', dueDate: '' },
    ]);
    expect(readExpenses({ items: [{ id: 'e', date: '2026-01-01', category: 'Nope', amountCents: 5 }] })[0].category).toBe('Other');
    expect(readContracts({ items: [{ id: 'c', title: 'T', status: 'x', file: { assetId: 1 } }] })[0]).toMatchObject({ status: 'draft', file: undefined });
    expect(readIncome(undefined)).toEqual([]);
  });

  it('exports CSV safely', () => {
    const csv = incomeCsv([inc({ date: '2026-01-02', client: '=HACK()', description: 'Logo, "final"', amountCents: 123456 })]);
    expect(csv).toBe('Date,Client,Description,Amount,Status,Due date\n2026-01-02,\'=HACK(),"Logo, ""final""",1234.56,paid,\n');
    expect(expensesCsv([])).toBe('Date,Description,Category,Amount\n');
  });

  it('lists years with the current year first', () => {
    expect(yearsIn(['2024-05-01', '2026-01-01', ''], NOW)).toEqual([2026, 2024]);
  });
});
