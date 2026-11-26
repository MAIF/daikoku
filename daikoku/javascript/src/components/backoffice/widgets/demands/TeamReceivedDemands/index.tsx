import { useContext } from "react";
import { QUERY_KEYS } from "../../../../../constants/queryKeys";
import { I18nContext } from "../../../../../contexts";
import { GlobalContext } from "../../../../../contexts/globalContext";
import { isError, ITeamSimple } from "../../../../../types";
import { DynamicTable, DynamicTableFeatures, FetchData } from "../../../../inputs";
import { findCurrentStep, isWaitingForPayment } from "../currentStep";
import { useQueryClient } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { toast } from "sonner";
import { rerunProcess } from "../../../../../services";
import { formatDate } from "../../../../utils";
import { ReceivedDemandActions } from "./ReceivedDemandActions";

const GET_TEAM_RECEIVED_DEMANDS = `
  query GetTeamReceivedDemands($teamId: String!, $limit: Int, $offset: Int) {
    subscriptionDemandsForAdmin(teamId: $teamId, limit: $limit, offset: $offset) {
      total
      subscriptionDemands {
        _id
        api {
          name
        }
        plan {
          customName
        }
        steps {
          state
          step {
            name
            title
          }
        }
        team {
          name
        }
        from {
          name
        }
        date
      }
    }
  }
`;

type ReceivedDemandGql = {
  _id: string;
  api: {
    name: string;
  };
  plan: {
    customName: string;
  };
  steps: Array<{
    state: string;
    step: {
      name: string;
      title: string;
    };
  }>;
  team: {
    name: string;
  };
  from: {
    name: string;
  };
  date: number;
};

type TeamReceivedDemandsGql = {
  subscriptionDemandsForAdmin: {
    total: number;
    subscriptionDemands: Array<ReceivedDemandGql>;
  };
};

type TeamReceivedDemandsProps = {
  team: ITeamSimple;
};

export const TeamReceivedDemands = ({ team }: TeamReceivedDemandsProps) => {
  const { translate } = useContext(I18nContext);
  const { customGraphQLClient } = useContext(GlobalContext);
  const queryClient = useQueryClient();

  const fetchReceivedDemands: FetchData<ReceivedDemandGql> = ({ limit, offset }) =>
    customGraphQLClient
      .request<TeamReceivedDemandsGql>(GET_TEAM_RECEIVED_DEMANDS, {
        teamId: team._id,
        limit,
        // subscriptionDemandsForAdmin reads its offset as a page number, not as a row offset
        offset: offset / limit,
      })
      .then(({ subscriptionDemandsForAdmin }) => ({
        items: subscriptionDemandsForAdmin.subscriptionDemands,
        total: subscriptionDemandsForAdmin.total,
      }));

  const rerunStep = (demand: ReceivedDemandGql) =>
    rerunProcess(team._id, demand._id).then((response) => {
      if (isError(response)) {
        toast.error(translate(response.error));
      } else {
        toast.success(translate('widget.demands.rerun-step.done'));
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.teamReceivedDemands(team._id) });
      }
    });

  const formatDemandDate = (millis: number) =>
    formatDate(millis, translate('date.locale'), translate('date.format.without.hours'));

  const columnHelper = createColumnHelper<DynamicTableFeatures, ReceivedDemandGql>();
  const columns = [
    columnHelper.display({
      id: 'team',
      meta: {
        title: translate('widget.demands.table.team'),
        size: 2,
      },
      cell: (info) => info.row.original.team.name,
    }),
    columnHelper.display({
      id: 'api',
      meta: {
        title: translate('widget.demands.table.api'),
        size: 2,
      },
      cell: (info) => info.row.original.api.name,
    }),
    columnHelper.display({
      id: 'plan',
      meta: {
        title: translate('widget.demands.table.plan'),
        size: 2,
      },
      cell: (info) => info.row.original.plan.customName,
    }),
    columnHelper.display({
      id: 'from',
      meta: {
        title: translate('widget.demands.table.from'),
        size: 2,
      },
      cell: (info) => info.row.original.from.name,
    }),
    columnHelper.display({
      id: 'date',
      meta: {
        title: translate('widget.demands.table.date'),
        size: 2,
      },
      cell: (info) => formatDemandDate(info.row.original.date),
    }),
    columnHelper.display({
      id: 'step',
      meta: {
        title: translate('widget.demands.table.step'),
        size: 2,
      },
      cell: (info) => {
        const demand = info.row.original;

        if (isWaitingForPayment(demand.steps)) {
          return <span className="badge --warning">{translate('widget.demands.state.payment')}</span>;
        }

        return <span className="badge --neutral">{findCurrentStep(demand.steps)?.step.title}</span>;
      },
    }),
    columnHelper.display({
      id: 'actions',
      meta: {
        size: 2,
      },
      cell: (info) => (
        <ReceivedDemandActions
          canRerunStep={!isWaitingForPayment(info.row.original.steps)}
          onRerunStep={() => rerunStep(info.row.original)}
        />
      ),
    }),
  ];

  return (
    <section className="flex-grow-1">
      <h4>{translate('widget.demands.ext.title')}</h4>
      <DynamicTable<ReceivedDemandGql>
        queryKey={QUERY_KEYS.teamReceivedDemands(team._id)}
        columns={columns}
        fetchData={fetchReceivedDemands}
        pageSize={10}
        persistFiltersInUrl={false}
        getRowId={(demand) => demand._id}
        getRowAriaLabel={(demand) => `${demand.team.name} - ${demand.api.name} - ${demand.plan.customName}`}
        emptyState={<div className="alert alert-info">{translate('widget.demands.ext.empty')}</div>}
      />
    </section>
  );
};
