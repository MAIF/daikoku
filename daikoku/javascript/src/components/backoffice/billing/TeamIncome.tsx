import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { endOfMonth, startOfMonth } from 'date-fns';
import maxBy from 'lodash/maxBy';
import orderBy from 'lodash/orderBy';
import sumBy from 'lodash/sumBy';
import { RefreshCw } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { I18nContext, useTeamBackOffice } from '../../../contexts';
import { GlobalContext } from '../../../contexts/globalContext';
import * as Services from '../../../services';
import { isError, ITeamSimple } from '../../../types';
import { DynamicTable, DynamicTableFeatures } from '../../inputs';
import { MonthPicker } from '../../inputs/monthPicker';
import { api, Can, formatCurrency, formatDate, getCurrencySymbol, read, Spinner } from '../../utils';
import { FeedbackButton } from '../../utils/FeedbackButton';

type TeamIncomeGql = {
  _id: string;
  api: { _id: string; name: string };
  plan: {
    _id: string;
    customName: string;
  } | null;
  team: { _id: string; name: string };
  billing: { hits: number; total: number };
  from: number;
  to: number;
};

export const TeamIncome = () => {
  const { isLoading, currentTeam, error } = useTeamBackOffice();

  const { translate, Translation } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);

  const [date, setDate] = useState(new Date());

  const queryClient = useQueryClient();
  const teamId = (currentTeam as ITeamSimple | undefined)?._id;

  const incomesQuery = useQuery({
    queryKey: ['team-income', teamId, date.getTime()],
    queryFn: () =>
      customGraphQLClient
        .request<{ teamIncomes: Array<TeamIncomeGql> }>(Services.graphql.getTeamIncome, {
          teamId,
          from: startOfMonth(date).getTime(),
          to: endOfMonth(date).getTime(),
        })
        .then(({ teamIncomes }) => orderBy(teamIncomes, (i) => i.billing.total, 'desc')),
    enabled: currentTeam && !isError(currentTeam),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (currentTeam && !isError(currentTeam))
      document.title = `${currentTeam.name} - ${translate('Income')}`;
  }, [currentTeam]);

  const incomes = incomesQuery.data ?? [];

  const sync = () =>
    Services.syncTeamIncome(teamId!)
      .then(() => queryClient.invalidateQueries({ queryKey: ['team-income'] }));

  const money = (amount: number) =>
    `${formatCurrency(amount)} ${getCurrencySymbol('EUR')}`;

  const columnHelper = createColumnHelper<DynamicTableFeatures, TeamIncomeGql>();
  const columns = [
    columnHelper.display({
      id: 'api',
      meta: { title: translate('billing.table.api'), size: 3 },
      cell: (info) => info.row.original.api.name,
    }),
    columnHelper.display({
      id: 'plan',
      meta: { title: translate('billing.table.plan'), size: 2 },
      cell: (info) => info.row.original.plan?.customName,
    }),
    columnHelper.display({
      id: 'team',
      meta: { title: translate('billing.table.team'), size: 3 },
      cell: (info) => info.row.original.team.name,
    }),
    columnHelper.display({
      id: 'calls',
      meta: { title: translate('billing.table.calls'), size: 2 },
      cell: (info) => info.row.original.billing.hits,
    }),
    columnHelper.display({
      id: 'total',
      meta: { title: translate('billing.table.total'), size: 2 },
      cell: (info) => money(info.row.original.billing.total),
    }),
  ];

  const getLastDate = () => {
    if (!incomes.length) return null;

    const lastDate = formatDate(
      maxBy(incomes, 'to')!.to,
      translate('date.locale'),
      translate('date.format')
    );

    return (
      <i className="ms-1">
        <Translation i18nkey="date.update" replacements={[lastDate]}>
          upd. {lastDate}
        </Translation>
      </i>
    );
  };

  const drawContent = () => {
    if (incomesQuery.isLoading) return <Spinner />;
    if (incomesQuery.isError) return <div className="alert alert-danger">{translate('billing.income.error')}</div>;
    if (!incomes.length) {
      return <div className="alert alert-info">{translate('billing.income.empty')}</div>;
    }

    const totalRow = {
      api: translate('Total'),
      calls: sumBy(incomes, (income) => income.billing.hits),
      total: money(sumBy(incomes, (income) => income.billing.total)),
    };

    return (
      <div style={incomesQuery.isPlaceholderData ? { opacity: 0.5 } : undefined} className='mt-3'>
        <DynamicTable<TeamIncomeGql>
          queryKey={['team-income-table', String(teamId), String(date.getTime()), String(incomesQuery.dataUpdatedAt)]}
          columns={columns}
          fetchData={() => Promise.resolve({ items: incomes, total: incomes.length })}
          getRowId={(income) => income._id}
          persistFiltersInUrl={false}
          totalRow={totalRow}
        />
      </div>
    );
  };

  if (isLoading) {
    return <Spinner />;
  } else if (currentTeam && !isError(currentTeam)) {
    const sellsNothing = !currentTeam.sellsPaidPlans;

    return (
      <Can I={read} a={api} team={currentTeam} dispatchError={true}>
        <div className="row">
          <div className="col">
            <h1>
              <Translation i18nkey="Income">Income</Translation>
            </h1>
            {sellsNothing && (
              <div className="alert alert-info">{translate('billing.income.no.paid.plan')}</div>
            )}
            <div className="month__selector d-flex align-items-center gap-2">
              <MonthPicker updateDate={setDate} value={date} />
              <FeedbackButton className="btn --secondary --small --icon-only" onPress={sync}>
                <RefreshCw />
              </FeedbackButton>
              {getLastDate()}
            </div>
            {drawContent()}
          </div>
        </div>
      </Can>
    );
  } else {
    toast.error(error?.message || currentTeam?.error);
    return <></>;
  }
};
