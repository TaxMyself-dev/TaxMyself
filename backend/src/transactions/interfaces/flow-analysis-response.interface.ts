export interface MonthlyFlowPoint {
  month: string; // "YYYY-MM"
  expenses: number;
  incomes: number;
}

export interface CategoryExpense {
  label: string | null;
  amount: number;
  percentage: number;
}

export interface FlowAnalysisResponse {
  totalExpenses: number;
  totalIncomes: number;
  monthlyFlow: MonthlyFlowPoint[];
  expensesByCategory: CategoryExpense[]; // all categories, ordered by amount desc
}
